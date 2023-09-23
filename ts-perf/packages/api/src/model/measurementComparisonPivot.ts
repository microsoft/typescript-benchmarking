import { MeasurementComparison } from "./measurementComparison";
import { ValueComparison } from "./valueComparison";

export class MeasurementComparisonPivot {
    constructor(
        public readonly measurement: MeasurementComparison,
        public readonly value: ValueComparison,
    ) {
    }

    public get name() {
        return `${this.measurementName} - ${this.metric}`;
    }
    public get measurementName() {
        return this.measurement.name;
    }
    public get scenarioName() {
        return this.measurement.scenarioName;
    }
    public get scenarioIndex() {
        return this.measurement.scenarioIndex;
    }
    public get hostName() {
        return this.measurement.hostName;
    }
    public get hostIndex() {
        return this.measurement.hostIndex;
    }
    public get host() {
        return this.measurement.host;
    }
    public get metric() {
        return this.value.metric;
    }
    public get metricIndex() {
        return this.value.metricIndex;
    }
    public get benchmark() {
        return this.value.benchmark;
    }
    public get benchmarkRelativeDelta() {
        return this.value.benchmarkRelativeDelta;
    }
    public get baseline() {
        return this.value.baseline;
    }
    public get baselineRelativeDelta() {
        return this.value.baselineRelativeDelta;
    }
    public get baselineRelativePValue() {
        return this.value.baselineRelativePValue;
    }
    public get baselineRelativeIsSignificant() {
        return this.value.baselineRelativeIsSignificant;
    }
    public get midline() {
        return this.value.midline;
    }
    public get midlineRelativeDelta() {
        return this.value.midlineRelativeDelta;
    }
    public get midlineRelativePValue() {
        return this.value.midlineRelativePValue;
    }
    public get midlineRelativeIsSignificant() {
        return this.value.midlineRelativeIsSignificant;
    }
    public get worst() {
        return this.value.worst;
    }
}
