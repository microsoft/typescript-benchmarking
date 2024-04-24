import { Measurement } from "./measurement";
import { Value } from "./value";

export class MeasurementPivot {
    constructor(
        public readonly measurement: Measurement,
        public readonly value: Value,
    ) {
    }

    public get name() {
        return `${this.measurement.name} - ${this.metric}`;
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
    public get metric() {
        return this.value.metric;
    }
    public get metricIndex() {
        return this.value.metricIndex;
    }
    public get samples() {
        return this.value.samples;
    }
    public get mean() {
        return this.value.mean;
    }
    public get minimum() {
        return this.value.minimum;
    }
    public get maximum() {
        return this.value.maximum;
    }
    public get marginOfError() {
        return this.value.marginOfError;
    }
    public get variance() {
        return this.value.variance;
    }
    public get standardDeviation() {
        return this.value.standardDeviation;
    }
    public get relativeMarginOfError() {
        return this.value.relativeMarginOfError;
    }
    public get unit() {
        return this.value.unit;
    }
    public get precision() {
        return this.value.precision;
    }
    public get allSamplesEqual() {
        return this.value.allSamplesEqual;
    }
}
