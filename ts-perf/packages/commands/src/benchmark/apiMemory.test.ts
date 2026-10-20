import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";

import { apiMemoryMetrics, apiMemorySampleKeys, Benchmark, computeMetrics, Measurement } from "@ts-perf/api";
import { expect, test } from "vitest";

import { readApiMemoryDumps } from "./apiMemory";
import { printBenchmark, printComparison } from "./print";

const dump = {
    schemaVersion: 1,
    client: {
        pid: 101,
        heapUsedBytes: 100,
        peakRSSBytes: 200,
        sampling: { id: "window-one", intervalBytes: 32768, allocatedBytes: 300 },
    },
    server: { pid: 201, heapAllocBytes: 400, totalAllocBytes: 500, peakRSSBytes: 600 },
};

async function withDumps(dumps: unknown[], callback: (directory: string) => Promise<void>) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-memory-test-"));
    try {
        await Promise.all(
            dumps.map((dump, i) => fs.writeFile(path.join(directory, `memory-${i}.json`), JSON.stringify(dump))),
        );
        await fs.writeFile(path.join(directory, "unrelated.json"), "{}");
        await callback(directory);
    }
    finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test("deduplicates shared processes/windows, sums disjoint windows, and never sums RSS peaks", async () => {
    await withDumps([
        dump,
        dump,
        {
            ...dump,
            client: {
                ...dump.client,
                heapUsedBytes: 150,
                sampling: { ...dump.client.sampling, allocatedBytes: 450 },
            },
            server: { ...dump.server, totalAllocBytes: 700 },
        },
        { ...dump, client: { ...dump.client, sampling: { ...dump.client.sampling, id: "window-two" } } },
        {
            ...dump,
            client: { ...dump.client, pid: 102, sampling: { ...dump.client.sampling, id: "window-three" } },
            server: { ...dump.server, pid: 202 },
        },
    ], async directory => {
        expect(await readApiMemoryDumps(directory)).toEqual({
            apiClientProcesses: 2,
            apiClientSampledAllocations: 1050,
            apiClientHeapUsed: 250,
            apiClientPeakRSS: 200,
            apiServerProcesses: 2,
            apiServerAllocations: 1200,
            apiServerHeapUsed: 800,
            apiServerPeakRSS: 600,
        });
    });
});

test("requires memory dumps and valid JSON", async () => {
    await withDumps([], async directory => {
        await expect(readApiMemoryDumps(directory)).rejects.toThrow("Missing API memory dumps");
        await expect(readApiMemoryDumps(path.join(directory, "absent"))).rejects.toThrow();
        await fs.writeFile(path.join(directory, "memory-broken.json"), "{");
        await expect(readApiMemoryDumps(directory)).rejects.toThrow();
    });
});

test.each([
    { ...dump, schemaVersion: 2 },
    { ...dump, client: null },
    { ...dump, server: null },
    { ...dump, client: { ...dump.client, pid: 0 } },
    { ...dump, server: { ...dump.server, pid: 1.5 } },
    { ...dump, client: { ...dump.client, sampling: undefined } },
    { ...dump, client: { ...dump.client, sampling: { ...dump.client.sampling, id: "" } } },
    { ...dump, server: { ...dump.server, peakRSSBytes: undefined } },
])("rejects missing/unsupported memory telemetry: %j", async value => {
    await withDumps([value], async directory => {
        await expect(readApiMemoryDumps(directory)).rejects.toThrow();
    });
});

test.each([16384, 32768, 65536])(
    "uses the producer's byte estimate independently of sampling interval %i",
    async intervalBytes => {
        await withDumps([{
            ...dump,
            client: { ...dump.client, sampling: { ...dump.client.sampling, intervalBytes } },
        }], async directory => {
            expect((await readApiMemoryDumps(directory)).apiClientSampledAllocations).toBe(300);
        });
    },
);

test.each([undefined, null, -1, Infinity, "100"])("rejects invalid byte counters: %s", async value => {
    await withDumps([{ ...dump, client: { ...dump.client, heapUsedBytes: value } }], async directory => {
        await expect(readApiMemoryDumps(directory)).rejects.toThrow("memory counter");
    });
});

test("rejects inconsistent sampling identity and aggregate overflow", async () => {
    await withDumps([dump, { ...dump, client: { ...dump.client, pid: 102 } }], async directory => {
        await expect(readApiMemoryDumps(directory)).rejects.toThrow("inconsistent PIDs");
    });
    await withDumps([
        { ...dump, server: { ...dump.server, totalAllocBytes: Number.MAX_VALUE } },
        { ...dump, server: { ...dump.server, pid: 202, totalAllocBytes: Number.MAX_VALUE } },
    ], async directory => {
        await expect(readApiMemoryDumps(directory)).rejects.toThrow("memory counter");
    });
});

test("preserves memory scalars through report serialization, merging and comparisons", async () => {
    await withDumps([dump], async directory => {
        const sample = await readApiMemoryDumps(directory);
        const values = Object.fromEntries(apiMemorySampleKeys.map(key => {
            const { metric, unit, precision } = apiMemoryMetrics[key];
            return [key, computeMetrics([sample[key], sample[key]], metric, unit, precision)];
        }));
        const measurement = new Measurement("api-fixture", 0, undefined, 0, values);
        const report = Benchmark.create({ measurements: [measurement], iterations: 2 });
        const restored = Benchmark.parse(JSON.stringify(report));
        expect(restored.measurements[0].values).toEqual(values);
        const merged = measurement.merge(restored.measurements[0]);
        for (const key of apiMemorySampleKeys) {
            expect(merged.values?.[key]?.samples).toEqual([sample[key], sample[key], sample[key], sample[key]]);
            expect(restored.diff(report)?.measurements[0].values[key]?.benchmarkRelativeDelta).toBe(0);
        }
        const timingOnly = new Measurement("api-fixture", 0, undefined, 0, {});
        expect(() => measurement.diff(timingOnly)).toThrow("both baseline and candidate");
        expect(() => timingOnly.diff(measurement)).toThrow("both baseline and candidate");
        expect(() => measurement.diff(measurement, timingOnly)).toThrow("both baseline and candidate");
        for (const format of ["console", "markdown", "html"] as const) {
            const out = new PassThrough();
            let text = "";
            out.on("data", chunk => text += chunk.toString());
            printBenchmark(restored, { format, color: false }, out);
            printComparison(restored.diff(report)!, { format, color: false }, out);
            for (const { metric } of Object.values(apiMemoryMetrics)) expect(text).toContain(metric);
        }
    });
});
