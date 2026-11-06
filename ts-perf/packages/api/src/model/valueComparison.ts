import { hodgesLehmann, signedRankTest } from "../signedRank";
import { utest } from "../utest";
import { Value, ValueComponents } from "./value";

const alpha = 0.05;

export interface ValueComparisonComponents {
    benchmark: Value | ValueComponents;
    baseline?: Value | ValueComponents;
    midline?: Value | ValueComponents;
    paired?: boolean;
}

interface Delta {
    relativeDelta: number;
    pValue: number;
}

function compare(benchmark: Value, other: Value | undefined, paired: boolean): Delta {
    if (!other) {
        return { relativeDelta: 0, pValue: 1 };
    }
    const a = benchmark.samples;
    const b = other.samples;
    if (paired && a.length > 0 && a.length === b.length && a.every(x => x > 0) && b.every(x => x > 0)) {
        // Sample i of each side was measured together, so their ratio cancels slowdowns
        // that hit both, such as a slower machine or a noisy stretch on it.
        const logRatios = a.map((x, i) => Math.log(x / b[i]));
        return { relativeDelta: Math.expm1(hodgesLehmann(logRatios)), pValue: signedRankTest(logRatios) };
    }
    return { relativeDelta: (benchmark.mean - other.mean) / other.mean, pValue: utest(b, a) };
}

export class ValueComparison {
    public readonly baselineRelativeDelta: number;
    public readonly midlineRelativeDelta: number;
    public readonly benchmarkRelativeDelta: number;
    public readonly baselineRelativePValue: number;
    public readonly midlineRelativePValue: number;
    public readonly worst: "baseline" | "midline";

    constructor(
        public readonly benchmark: Value,
        public readonly baseline?: Value,
        public readonly midline?: Value,
        public readonly paired = false,
    ) {
        const baselineDelta = compare(this.benchmark, this.baseline, paired);
        const midlineDelta = compare(this.benchmark, this.midline, paired);
        this.baselineRelativeDelta = baselineDelta.relativeDelta;
        this.midlineRelativeDelta = midlineDelta.relativeDelta;
        this.benchmarkRelativeDelta = Math.max(this.baselineRelativeDelta, this.midlineRelativeDelta);
        this.baselineRelativePValue = baselineDelta.pValue;
        this.midlineRelativePValue = midlineDelta.pValue;
        this.worst = this.baselineRelativeDelta > this.midlineRelativeDelta ? "baseline" : "midline";
    }

    public get metric() {
        return this.benchmark.metric;
    }
    public get metricIndex() {
        return this.benchmark.metricIndex;
    }
    public get baselineRelativeIsSignificant() {
        return this.baselineRelativePValue < alpha;
    }
    public get midlineRelativeIsSignificant() {
        return this.midlineRelativePValue < alpha;
    }

    public static create(components: ValueComparisonComponents) {
        return components instanceof ValueComparison ? components : new ValueComparison(
            Value.create(components.benchmark),
            components.baseline && Value.create(components.baseline),
            components.midline && Value.create(components.midline),
            components.paired,
        );
    }

    public getComponents(): ValueComparisonComponents {
        return {
            benchmark: this.benchmark,
            baseline: this.baseline,
            midline: this.midline,
            paired: this.paired,
        };
    }

    public with(components: Partial<ValueComparisonComponents>) {
        const { benchmark = this.benchmark } = components;
        const { baseline = this.baseline } = components;
        const { midline = this.midline } = components;
        const { paired = this.paired } = components;

        if (
            benchmark === this.benchmark
            && baseline === this.baseline
            && midline === this.midline
            && paired === this.paired
        ) {
            return this;
        }

        return ValueComparison.create({
            benchmark,
            baseline,
            midline,
            paired,
        });
    }
}
