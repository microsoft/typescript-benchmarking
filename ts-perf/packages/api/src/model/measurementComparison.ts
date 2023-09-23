import { Measurement, MeasurementComponents } from "./measurement";
import { MeasurementComparisonPivot } from "./measurementComparisonPivot";
import { Value } from "./value";
import { ValueComparison } from "./valueComparison";

export interface MeasurementComparisonComponents {
    benchmark: Measurement | MeasurementComponents;
    baseline?: Measurement | MeasurementComponents;
    midline?: Measurement | MeasurementComponents;
}

const hasOwnProperty = Object.prototype.hasOwnProperty;
function hasProperty(map: {}, key: string): boolean {
    return hasOwnProperty.call(map, key);
}

export class MeasurementComparison {
    public readonly values: Record<string, ValueComparison | undefined>;

    constructor(
        public readonly benchmark: Measurement,
        public readonly baseline?: Measurement,
        public readonly midline?: Measurement,
    ) {
        this.values = {};
        for (const key in benchmark.values) {
            if (hasProperty(benchmark.values, key)) {
                this.values[key] = Value.diff(benchmark.values[key], baseline?.values?.[key], midline?.values?.[key]);
            }
        }
    }

    public get name() {
        return `${this.scenarioName} - ${this.hostName}`;
    }
    public get scenarioName() {
        return this.benchmark.scenarioName;
    }
    public get scenarioIndex() {
        return this.benchmark.scenarioIndex;
    }
    public get hostName() {
        return this.benchmark.hostName;
    }
    public get hostIndex() {
        return this.benchmark.hostIndex;
    }
    public get host() {
        return this.benchmark.host;
    }

    public static create(components: MeasurementComparisonComponents) {
        return components instanceof MeasurementComparison ? components : new MeasurementComparison(
            Measurement.create(components.benchmark),
            components.baseline && Measurement.create(components.baseline),
            components.midline && Measurement.create(components.midline),
        );
    }

    public getComponents(): MeasurementComparisonComponents {
        return {
            benchmark: this.benchmark,
            baseline: this.baseline,
            midline: this.midline,
        };
    }

    public with(components: Partial<MeasurementComparisonComponents>) {
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

        return MeasurementComparison.create({ benchmark, baseline, midline });
    }

    public pivot() {
        const pivots: MeasurementComparisonPivot[] = [];
        for (const key in this.values) {
            if (hasProperty(this.values, key)) {
                const value = this.values[key];
                if (value) {
                    pivots.push(new MeasurementComparisonPivot(this, value));
                }
            }
        }
        return pivots;
    }
}
