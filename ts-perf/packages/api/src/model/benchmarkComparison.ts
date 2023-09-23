import { Query } from "iterable-query";

import { Benchmark, BenchmarkComponents } from "./benchmark";
import { Measurement } from "./measurement";
import { MeasurementComparison } from "./measurementComparison";

export interface BenchmarkComparisonComponents {
    benchmark: Benchmark | BenchmarkComponents;
    baseline?: Benchmark | BenchmarkComponents;
    midline?: Benchmark | BenchmarkComponents;
}

export class BenchmarkComparison {
    public readonly measurements: readonly MeasurementComparison[];

    constructor(
        public readonly benchmark: Benchmark,
        public readonly baseline: Benchmark | undefined,
        public readonly midline: Benchmark | undefined,
    ) {
        this.measurements = Query
            .from(benchmark.measurements)
            .fullJoin(
                baseline ? baseline.measurements : [],
                x => x.name,
                x => x.name,
                (benchmark, baseline) => ({ benchmark, baseline }),
            )
            .fullJoin(
                midline ? midline.measurements : [],
                ({ benchmark }) => benchmark && benchmark.name,
                x => x.name,
                (left, midline) => ({ benchmark: left && left.benchmark, baseline: left && left.baseline, midline }),
            )
            .select(({ benchmark, baseline, midline }) => Measurement.diff(benchmark, baseline, midline)!)
            .where((diff: MeasurementComparison | undefined): diff is MeasurementComparison => diff !== undefined)
            .orderBy(scenario => scenario.scenarioName)
            .thenBy(scenario => scenario.hostName)
            .toArray();
    }

    public static create(components: BenchmarkComparisonComponents) {
        return components instanceof BenchmarkComparison ? components : new BenchmarkComparison(
            Benchmark.create(components.benchmark),
            components.baseline && Benchmark.create(components.baseline),
            components.midline && Benchmark.create(components.midline),
        );
    }

    public getComponents(): BenchmarkComparisonComponents {
        return {
            benchmark: this.benchmark,
            baseline: this.baseline,
            midline: this.midline,
        };
    }

    public with(components: Partial<BenchmarkComparisonComponents>) {
        const { benchmark = this.benchmark } = components;
        const { baseline = this.baseline } = components;
        const { midline = this.midline } = components;

        if (
            benchmark === this.benchmark
            && baseline === this.baseline
            && midline === this.midline
        ) {
            return this;
        }

        return BenchmarkComparison.create({ benchmark, baseline, midline });
    }
}
