import { utest } from "../utest";
import { Value, ValueComponents } from "./value";

const alpha = 0.05;

export interface ValueComparisonComponents {
    benchmark: Value | ValueComponents;
    baseline?: Value | ValueComponents;
    midline?: Value | ValueComponents;
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
    ) {
        this.baselineRelativeDelta = this.baseline ? (this.benchmark.mean - this.baseline.mean) / this.baseline.mean
            : 0;
        this.midlineRelativeDelta = this.midline ? (this.benchmark.mean - this.midline.mean) / this.midline.mean : 0;
        this.benchmarkRelativeDelta = Math.max(this.baselineRelativeDelta, this.midlineRelativeDelta);
        this.baselineRelativePValue = this.baseline ? utest(this.baseline.samples, this.benchmark.samples) : 1;
        this.midlineRelativePValue = this.midline ? utest(this.midline.samples, this.benchmark.samples) : 1;
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
        );
    }

    public getComponents(): ValueComparisonComponents {
        return {
            benchmark: this.benchmark,
            baseline: this.baseline,
            midline: this.midline,
        };
    }

    public with(components: Partial<ValueComparisonComponents>) {
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

        return ValueComparison.create({
            benchmark,
            baseline,
            midline,
        });
    }
}
