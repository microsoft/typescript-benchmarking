import fs from "node:fs";

import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { waitForBenchmarkIdle } from "../waitForBenchmarkIdle.js";

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function mockCounters(options: {
    busy?: (second: number, cpu: number) => number;
    pressure?: (second: number, resource: string) => number;
    pressureError?: string;
} = {}) {
    let second = -1;
    const ticks = Array<number>(8).fill(0);
    const busy = Array<number>(8).fill(0);
    const pressure = new Map<string, number>();
    return vi.spyOn(fs, "readFileSync").mockImplementation(file => {
        if (file === "/proc/stat") {
            second++;
            return ticks.map((_, cpu) => {
                ticks[cpu] += 100;
                busy[cpu] += options.busy?.(second, cpu) ?? 3;
                return `cpu${cpu} ${busy[cpu]} 0 0 ${ticks[cpu] - busy[cpu]} 0 0 0 0 ${busy[cpu]} 0`;
            }).join("\n");
        }
        const resource = String(file).split("/").at(-1)!;
        if (options.pressureError) {
            throw Object.assign(new Error("cannot read pressure"), { code: options.pressureError });
        }
        const total = (pressure.get(resource) ?? 0) + (options.pressure?.(second, resource) ?? 0);
        pressure.set(resource, total);
        return `some avg10=99.99 avg60=99.99 avg300=99.99 total=${total}\nfull avg10=0 total=0\n`;
    });
}

test("requires five quiet seconds and uses deltas rather than stale averages or double-counted guest time", async () => {
    const read = mockCounters();
    const waiting = waitForBenchmarkIdle();
    await vi.advanceTimersByTimeAsync(4000);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
    await vi.advanceTimersByTimeAsync(1000);
    await waiting;
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
    expect(read).toHaveBeenCalledTimes(24);
});

test("restarts the quiet window when one CPU becomes busy", async () => {
    mockCounters({ busy: (second, cpu) => second === 3 && cpu === 0 ? 30 : 0 });
    const waiting = waitForBenchmarkIdle();
    await vi.advanceTimersByTimeAsync(7000);
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
    await vi.advanceTimersByTimeAsync(1000);
    await waiting;
});

test.each(["cpu", "io", "memory"])("waits for recent %s pressure to subside", async resource => {
    mockCounters({ pressure: (second, name) => second <= 3 && name === resource ? 20_000 : 0 });
    const waiting = waitForBenchmarkIdle();
    await vi.advanceTimersByTimeAsync(8000);
    await waiting;
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`${resource}=2.00%`));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
});

test("fails within the time bound instead of starting measurements on a persistently busy machine", async () => {
    mockCounters({ busy: () => 50 });
    const waiting = expect(waitForBenchmarkIdle()).rejects.toThrow("Machine did not become quiet within 60s");
    await vi.advanceTimersByTimeAsync(60_000);
    await waiting;
    expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
    expect(vi.getTimerCount()).toBe(0);
});

test("explicitly warns once per unavailable pressure signal and still checks CPU counters", async () => {
    mockCounters({ pressureError: "ENOENT" });
    const waiting = waitForBenchmarkIdle();
    await vi.advanceTimersByTimeAsync(5000);
    await waiting;
    expect(console.warn).toHaveBeenCalledTimes(3);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("cpu pressure counters unavailable"));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Machine is quiet"));
});

test("does not suppress permission errors reading telemetry", async () => {
    mockCounters({ pressureError: "EACCES" });
    await expect(waitForBenchmarkIdle()).rejects.toMatchObject({ code: "EACCES" });
});

test("rejects malformed pressure telemetry rather than treating it as idle", async () => {
    vi.spyOn(fs, "readFileSync").mockImplementation(file =>
        file === "/proc/stat" ? "cpu0 0 0 0 100 0 0 0 0\n" : "some avg10=0 total=invalid\n"
    );
    await expect(waitForBenchmarkIdle()).rejects.toThrow("Missing cpu pressure counter");
});

test.each(["cpu0 invalid\n", "intr 1\n"])("rejects malformed or missing CPU counters: %s", async counters => {
    vi.spyOn(fs, "readFileSync").mockReturnValue(counters);
    await expect(waitForBenchmarkIdle()).rejects.toThrow(/CPU counters/);
});
