import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { readApiTimingDumps } from "./apiTiming";

const dump = {
    schemaVersion: 1,
    timing: {
        enabled: true,
        totals: {
            requestCount: 3,
            roundTripMs: 10,
            bytesSent: 100,
            bytesReceived: 200,
            nodesMaterialized: 2,
            sourceFilesFetched: 1,
            nodesFetched: 4,
            serverTimeMs: 6,
            transportOverheadMs: 4,
        },
    },
    serverTiming: { enabled: true, totals: { requestCount: 3, totalProcessingTimeMs: 6 } },
};

async function withDirectory(callback: (directory: string) => Promise<void>) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-timing-test-"));
    try {
        await callback(directory);
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test("sums all client/server counters without double-counting server processing", async () => {
    await withDirectory(async directory => {
        await fs.writeFile(path.join(directory, "timing-one.json"), JSON.stringify(dump));
        await fs.writeFile(path.join(directory, "timing-two.json"), JSON.stringify(dump));
        await fs.writeFile(path.join(directory, "unrelated.txt"), "");
        expect(await readApiTimingDumps(directory)).toEqual({
            apiClientInstances: 2,
            apiRequests: 6,
            apiRoundTripTime: 20,
            apiBytesSent: 200,
            apiBytesReceived: 400,
            apiNodesMaterialized: 4,
            apiSourceFilesFetched: 2,
            apiNodesFetched: 8,
            apiServerRequests: 6,
            apiServerProcessingTime: 12,
            apiTransportResidualTime: 8,
        });
    });
});

test("requires timing files and rejects malformed JSON", async () => {
    await withDirectory(async directory => {
        await expect(readApiTimingDumps(directory)).rejects.toThrow("Missing API timing dumps");
        await expect(readApiTimingDumps(path.join(directory, "absent"))).rejects.toThrow();
        await fs.writeFile(path.join(directory, "timing-broken.json"), "{");
        await expect(readApiTimingDumps(directory)).rejects.toThrow();
    });
});

test.each([
    { ...dump, schemaVersion: 2 },
    { ...dump, timing: undefined },
    { ...dump, timing: { ...dump.timing, enabled: false } },
    { ...dump, timing: { ...dump.timing, totals: undefined } },
    { ...dump, serverTiming: null },
    { ...dump, serverTiming: { enabled: false, totals: dump.serverTiming.totals } },
    { ...dump, serverTiming: { enabled: true, totals: {} } },
])("rejects missing or unsupported timing totals: %j", async value => {
    await withDirectory(async directory => {
        await fs.writeFile(path.join(directory, "timing-one.json"), JSON.stringify(value));
        await expect(readApiTimingDumps(directory)).rejects.toThrow();
    });
});

test.each([undefined, null, -1, Infinity])("rejects invalid counters rather than reporting zeros: %s", async value => {
    await withDirectory(async directory => {
        await fs.writeFile(
            path.join(directory, "timing-one.json"),
            JSON.stringify({
                ...dump,
                timing: { ...dump.timing, totals: { ...dump.timing.totals, bytesSent: value } },
            }),
        );
        await expect(readApiTimingDumps(directory)).rejects.toThrow("counter");
    });
});

test("rejects zero-work telemetry", async () => {
    await withDirectory(async directory => {
        await fs.writeFile(
            path.join(directory, "timing-one.json"),
            JSON.stringify({
                ...dump,
                timing: { ...dump.timing, totals: { ...dump.timing.totals, requestCount: 0 } },
            }),
        );
        await expect(readApiTimingDumps(directory)).rejects.toThrow("no requests");
    });
});
