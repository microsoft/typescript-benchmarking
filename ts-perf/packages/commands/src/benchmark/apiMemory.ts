import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { ApiMemorySampleKey } from "@ts-perf/api";

function counter(value: unknown, name: string): number {
    assert(
        typeof value === "number" && Number.isFinite(value) && value >= 0,
        `Missing or invalid API memory counter: ${name}`,
    );
    return value;
}

function pid(value: unknown): number {
    assert(typeof value === "number" && Number.isSafeInteger(value) && value > 0, "Missing or invalid API memory PID");
    return value;
}

export async function readApiMemoryDumps(directory: string): Promise<Record<ApiMemorySampleKey, number>> {
    const files = (await fs.readdir(directory)).filter(name => name.startsWith("memory-") && name.endsWith(".json"));
    assert(
        files.length,
        "Missing API memory dumps. --apiMemory requires compiler support for TS_API_MEMORY_DIR and clients must close.",
    );
    const clients = new Map<number, { heap: number; rss: number; }>();
    const servers = new Map<number, { heap: number; allocated: number; }>();
    const windows = new Map<string, { pid: number; allocated: number; }>();
    for (const file of files) {
        const dump = JSON.parse(await fs.readFile(path.join(directory, file), "utf8"));
        assert.equal(dump.schemaVersion, 1, "Unsupported API memory schema");
        assert(dump.client && dump.server, "Missing API client or server memory");
        const clientPid = pid(dump.client.pid);
        const serverPid = pid(dump.server.pid);
        const clientHeap = counter(dump.client.heapUsedBytes, "client.heapUsedBytes");
        const clientRSS = counter(dump.client.peakRSSBytes, "client.peakRSSBytes");
        const serverHeap = counter(dump.server.heapAllocBytes, "server.heapAllocBytes");
        const serverAllocated = counter(dump.server.totalAllocBytes, "server.totalAllocBytes");
        const sampling = dump.client.sampling;
        assert(
            sampling && typeof sampling.id === "string" && sampling.id.length,
            "Missing API allocation sampling window",
        );
        const allocated = counter(sampling.allocatedBytes, "client.sampling.allocatedBytes");
        const window = windows.get(sampling.id);
        assert(!window || window.pid === clientPid, "API allocation sampling window has inconsistent PIDs");
        windows.set(sampling.id, { pid: clientPid, allocated: Math.max(window?.allocated ?? 0, allocated) });
        const client = clients.get(clientPid);
        clients.set(clientPid, {
            heap: Math.max(client?.heap ?? 0, clientHeap),
            rss: Math.max(client?.rss ?? 0, clientRSS),
        });
        const server = servers.get(serverPid);
        servers.set(serverPid, {
            heap: Math.max(server?.heap ?? 0, serverHeap),
            allocated: Math.max(server?.allocated ?? 0, serverAllocated),
        });
    }
    const values: Record<ApiMemorySampleKey, number> = {
        apiClientProcesses: clients.size,
        apiClientSampledAllocations: [...windows.values()].reduce((sum, window) => sum + window.allocated, 0),
        apiClientHeapUsed: [...clients.values()].reduce((sum, client) => sum + client.heap, 0),
        apiClientPeakRSS: Math.max(...[...clients.values()].map(client => client.rss)),
        apiServerProcesses: servers.size,
        apiServerAllocations: [...servers.values()].reduce((sum, server) => sum + server.allocated, 0),
        apiServerHeapUsed: [...servers.values()].reduce((sum, server) => sum + server.heap, 0),
    };
    for (const [key, value] of Object.entries(values)) counter(value, key);
    return values;
}
