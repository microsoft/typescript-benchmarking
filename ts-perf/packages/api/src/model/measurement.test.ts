import { expect, test } from "vitest";

import { formatComparisonBaseline, formatComparisonCurrent, formatComparisonMetric } from "../format";
import { Benchmark } from "./benchmark";
import { HostSpecifier } from "./hostSpecifier";
import { Measurement } from "./measurement";
import { computeMetrics } from "./value";

const measurement = new Measurement("test", 1, HostSpecifier.create({ name: "node", version: "v24.21.0" }), 1, {
    totalTime: computeMetrics([1, 2], "Total time", "s", 4),
});

test("measurement indices survive serialization and legacy output", () => {
    const restored = Measurement.create(JSON.parse(JSON.stringify(measurement)));
    expect(restored.scenarioIndex).toBe(1);
    expect(restored.hostIndex).toBe(1);
    expect(
        Measurement.create({ ...JSON.parse(JSON.stringify(measurement)), scenarioIndex: undefined, scenarioArgs: 7 })
            .scenarioIndex,
    ).toBe(7);
    expect(restored.values?.totalTime?.samples).toEqual([1, 2]);
});

function report() {
    return Benchmark.create({
        scenarios: [
            { name: "unused", kind: "tsc", configFile: "/unused/scenario.json" },
            { name: "test", kind: "tsc", configFile: "/test/scenario.json" },
        ],
        hosts: [{ name: "node", version: "v22.0.0" }, { name: "node", version: "v24.21.0" }],
        measurements: [measurement],
    });
}

test("host-only filtering remaps hostIndex and preserves scenarioIndex", () => {
    const filtered = report().filter([], ["node@24.21.0"]);
    expect(filtered.hosts).toHaveLength(1);
    expect(filtered.measurements).toHaveLength(1);
    expect(filtered.measurements[0].hostIndex).toBe(0);
    expect(filtered.measurements[0].scenarioIndex).toBe(1);
    expect(Measurement.create(JSON.parse(JSON.stringify(filtered.measurements[0]))).hostIndex).toBe(0);
});

test("scenario-only filtering remaps scenarioIndex and preserves hostIndex", () => {
    const filtered = report().filter(["test"], []);
    expect(filtered.scenarios).toHaveLength(1);
    expect(filtered.measurements).toHaveLength(1);
    expect(filtered.measurements[0].scenarioIndex).toBe(0);
    expect(filtered.measurements[0].hostIndex).toBe(1);
    expect(filtered.measurements[0].values?.totalTime?.samples).toEqual([1, 2]);
});

const failed = Measurement.createFailed("test", 1, measurement.host!, 1);

test("failed measurements survive serialization, filtering and merging", () => {
    const restored = Measurement.create(JSON.parse(JSON.stringify(failed)));
    expect(restored.failed).toBe(true);
    expect(restored.values).toEqual({});
    expect(Measurement.create(JSON.parse(JSON.stringify(measurement))).failed).toBe(false);

    expect(report().with({ measurements: [failed] }).filter([], ["node@24.21.0"]).measurements[0].failed).toBe(true);

    expect(measurement.merge(failed).failed).toBe(true);
    expect(failed.merge(measurement).failed).toBe(true);
});

test("comparisons with a failed side pivot to a single failed row", () => {
    const passing = report();
    const crashed = passing.with({ measurements: [failed] });

    for (const comparison of [crashed.diff(passing)!, passing.diff(crashed)!]) {
        const pivots = comparison.measurements[0].pivot();
        expect(pivots).toHaveLength(1);
        expect(pivots[0].failed).toBe(true);
    }

    const [pivot] = crashed.diff(passing)!.measurements[0].pivot();
    expect(formatComparisonMetric(pivot)).toBe("⚠️ Failed");
    expect(formatComparisonBaseline(pivot)).toBe("");
    expect(formatComparisonCurrent(pivot)).toBe("failed");
    expect(failed.pivot().map(pivot => pivot.failed)).toEqual([true]);
});

test("normalizing times removes per-machine offsets but keeps other metrics", () => {
    const host = HostSpecifier.create({ name: "node", version: "v24.21.0" });
    const machine = (time: number[], memory: number[]) =>
        report().with({
            measurements: [
                new Measurement("test", 1, host, 1, {
                    totalTime: computeMetrics(time, "Total time", "s", 4),
                    memoryUsed: computeMetrics(memory, "Memory used", "k", 0),
                }),
            ],
        });
    const [fast, slow] = Benchmark.normalizeTimes([machine([1, 1.2], [10, 20]), machine([2, 2.4], [30, 40])]);

    for (const benchmark of [fast, slow]) {
        const samples = benchmark.measurements[0].values!.totalTime!.samples;
        expect(samples[0]).toBeCloseTo(1.5);
        expect(samples[1]).toBeCloseTo(1.8);
    }
    expect(fast.measurements[0].values?.memoryUsed?.samples).toEqual([10, 20]);

    const merged = fast.merge(slow).measurements[0].values!.totalTime!;
    expect(merged.mean).toBeCloseTo(1.65);
    expect(merged.relativeMarginOfError).toBeLessThan(
        machine([1, 1.2, 2, 2.4], [0]).measurements[0].values!.totalTime!.relativeMarginOfError,
    );

    const [alone] = Benchmark.normalizeTimes([machine([1, 1.2], [10, 20])]);
    expect(alone.measurements[0].values?.totalTime?.samples).toEqual([1, 1.2]);
});

test("normalizing with partners keeps the ratios between paired samples", () => {
    const host = HostSpecifier.create({ name: "node", version: "v24.21.0" });
    const machine = (time: number[]) =>
        report().with({
            measurements: [new Measurement("test", 1, host, 1, { totalTime: computeMetrics(time, "Total time", "s", 4) })],
        });
    const baselines = [machine([1, 1]), machine([2, 2])];
    const news = [machine([1.1, 1.1]), machine([1.8, 1.8])];
    const normalizedBaselines = Benchmark.normalizeTimes(baselines, news);
    const normalizedNews = Benchmark.normalizeTimes(news, baselines);

    for (let i = 0; i < 2; i++) {
        const baseline = normalizedBaselines[i].measurements[0].values!.totalTime!.samples[0];
        const current = normalizedNews[i].measurements[0].values!.totalTime!.samples[0];
        const original = news[i].measurements[0].values!.totalTime!.samples[0]
            / baselines[i].measurements[0].values!.totalTime!.samples[0];
        expect(current / baseline).toBeCloseTo(original);
    }
    expect(() => Benchmark.normalizeTimes(baselines, [news[0]])).toThrow();
});

test("large samples use the normal critical value", () => {
    const samples = Array.from({ length: 40 }, (_, i) => 1 + (i % 2) / 10);
    const value = computeMetrics(samples, "Total time", "s", 4)!;
    expect(value.marginOfError).toBeCloseTo(1.96 * value.standardDeviation / Math.sqrt(40));
});
