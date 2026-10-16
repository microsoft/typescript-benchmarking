import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ApiTimingSampleKey, apiTimingSampleKeys } from "@ts-perf/api";

export async function readApiTimingDumps(directory: string) {
    const files = (await fs.readdir(directory)).filter(name => name.startsWith("timing-") && name.endsWith(".json"));
    assert(
        files.length,
        "Missing API timing dumps. The compiler must support TS_API_TIMING_DIR and clients must close.",
    );
    const values: Record<ApiTimingSampleKey, number> = {
        apiClientInstances: files.length,
        apiRequests: 0,
        apiRoundTripTime: 0,
        apiBytesSent: 0,
        apiBytesReceived: 0,
        apiNodesMaterialized: 0,
        apiSourceFilesFetched: 0,
        apiNodesFetched: 0,
        apiServerRequests: 0,
        apiServerProcessingTime: 0,
        apiTransportResidualTime: 0,
    };
    for (const file of files) {
        const dump = JSON.parse(await fs.readFile(path.join(directory, file), "utf8"));
        assert.equal(dump.schemaVersion, 1, "Unsupported API timing schema");
        assert(dump.timing?.enabled && dump.serverTiming?.enabled, "Missing client or server timing collection");
        const client = dump.timing.totals;
        const server = dump.serverTiming.totals;
        assert(client && server, "Missing API timing totals");
        const sample: Record<ApiTimingSampleKey, number> = {
            apiClientInstances: 0,
            apiRequests: client.requestCount,
            apiRoundTripTime: client.roundTripMs,
            apiBytesSent: client.bytesSent,
            apiBytesReceived: client.bytesReceived,
            apiNodesMaterialized: client.nodesMaterialized,
            apiSourceFilesFetched: client.sourceFilesFetched,
            apiNodesFetched: client.nodesFetched,
            apiServerRequests: server.requestCount,
            apiServerProcessingTime: server.totalProcessingTimeMs,
            apiTransportResidualTime: client.transportOverheadMs,
        };
        for (const key of apiTimingSampleKeys) {
            assert(Number.isFinite(sample[key]) && sample[key] >= 0, `Missing or invalid API timing counter: ${key}`);
            values[key] += sample[key];
            assert(Number.isFinite(values[key]), `API timing counter overflow: ${key}`);
        }
    }
    assert(values.apiRequests > 0, "API timing dumps contain no requests");
    return values;
}
