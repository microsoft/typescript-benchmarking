import { getCompilerMetricIndex } from "./sample";
import { ValueComparison } from "./valueComparison";

export interface ValueComponents {
    metric: string;
    samples: readonly number[];
    mean: number;
    minimum: number;
    maximum: number;
    marginOfError: number;
    variance: number;
    standardDeviation: number;
    relativeMarginOfError: number;
    unit: string;
    precision: number;
}

export class Value {
    constructor(
        public readonly metric: string,
        public readonly samples: readonly number[],
        public readonly mean: number,
        public readonly minimum: number,
        public readonly maximum: number,
        public readonly marginOfError: number,
        public readonly variance: number,
        public readonly standardDeviation: number,
        public readonly relativeMarginOfError: number,
        public readonly unit: string,
        public readonly precision: number,
    ) {
    }

    public get size() {
        return this.samples ? this.samples.length : 0;
    }
    public get metricIndex() {
        return getCompilerMetricIndex(this.metric);
    }

    public get allSamplesEqual() {
        return this.samples.every(sample => sample === this.samples[0]);
    }

    public static create(components: ValueComponents) {
        return components instanceof Value ? components : new Value(
            components.metric,
            components.samples,
            components.mean,
            components.minimum,
            components.maximum,
            components.marginOfError,
            components.variance,
            components.standardDeviation,
            components.relativeMarginOfError,
            components.unit,
            components.precision,
        );
    }

    public getComponents(): ValueComponents {
        return {
            metric: this.metric,
            samples: this.samples,
            mean: this.mean,
            minimum: this.minimum,
            maximum: this.maximum,
            marginOfError: this.marginOfError,
            variance: this.variance,
            standardDeviation: this.standardDeviation,
            relativeMarginOfError: this.relativeMarginOfError,
            unit: this.unit,
            precision: this.precision,
        };
    }

    public with(components: Partial<ValueComponents>) {
        const { metric = this.metric } = components;
        const { samples = this.samples } = components;
        const { mean = this.mean } = components;
        const { minimum = this.minimum } = components;
        const { maximum = this.maximum } = components;
        const { marginOfError = this.marginOfError } = components;
        const { variance = this.variance } = components;
        const { standardDeviation = this.standardDeviation } = components;
        const { relativeMarginOfError = this.relativeMarginOfError } = components;
        const { unit = this.unit } = components;
        const { precision = this.precision } = components;

        if (
            this.metric === metric && this.samples === samples && this.mean === mean
            && this.minimum === minimum && this.maximum === maximum && this.marginOfError === marginOfError
            && this.variance === variance && this.standardDeviation === standardDeviation
            && this.relativeMarginOfError === relativeMarginOfError && this.unit === unit
            && this.precision === precision
        ) {
            return this;
        }

        return Value.create({
            metric,
            samples,
            mean,
            minimum,
            maximum,
            marginOfError,
            variance,
            standardDeviation,
            relativeMarginOfError,
            unit,
            precision,
        });
    }

    public static diff(benchmark: Value | undefined, baseline: Value | undefined, midline?: Value) {
        return benchmark && benchmark.diff(baseline, midline);
    }

    public diff(baseline: Value | undefined, midline?: Value) {
        return baseline || midline ? new ValueComparison(this, baseline, midline) : undefined;
    }

    public toJSON(): any {
        return this.getComponents();
    }

    public merge(other: Value): Value {
        if (this.metric !== other.metric) {
            throw new Error("Cannot merge values with different metrics.");
        }
        if (this.unit !== other.unit) {
            throw new Error("Cannot merge values with different units.");
        }
        if (this.precision !== other.precision) {
            throw new Error("Cannot merge values with different precisions.");
        }
        const samples = [...this.samples, ...other.samples];
        return computeMetrics(samples, this.metric, this.unit, this.precision)!;
    }
}

/**
 * Two-sided 95% critical region Student's T distribution
 * https://en.wikipedia.org/wiki/Student%27s_t-distribution
 */
const T: number[] = [
    12.706,
    4.303,
    3.182,
    2.776,
    2.571,
    2.447,
    2.365,
    2.306,
    2.262,
    2.228,
    2.201,
    2.179,
    2.16,
    2.145,
    2.131,
    2.12,
    2.11,
    2.101,
    2.093,
    2.086,
    2.08,
    2.074,
    2.069,
    2.064,
    2.06,
    2.056,
    2.052,
    2.048,
    2.045,
    2.042,
    1.96,
];

export function computeMetrics(samples: number[], metric: string, unit: string, precision: number): Value | undefined {
    let sum = 0;
    let size = 0;
    let minimum = +Infinity;
    let maximum = -Infinity;
    for (const x of samples) {
        if (isFinite(x)) {
            sum += x;
            minimum = Math.min(minimum, x);
            maximum = Math.max(maximum, x);
            size++;
        }
    }

    if (size !== samples.length) {
        return undefined;
    }

    const mean = size > 0
        ? sum / size
        : 0;

    sum = 0;
    for (const x of samples) {
        if (isFinite(x)) {
            sum += (x - mean) ** 2;
        }
    }

    const variance = size > 1
        ? sum / (size - 1)
        : 0;

    const standardDeviation = Math.sqrt(variance);
    const standardError = standardDeviation / Math.sqrt(size);
    const tIndex = Math.round(size - 1);
    const criticalValue = T[tIndex < 1 ? 1 : tIndex > 30 ? 0 : tIndex];
    const marginOfError = standardError * criticalValue;
    const relativeMarginOfError = marginOfError / mean;
    return new Value(
        metric,
        samples,
        mean,
        minimum,
        maximum,
        marginOfError,
        variance,
        standardDeviation,
        relativeMarginOfError,
        unit,
        precision,
    );
}
