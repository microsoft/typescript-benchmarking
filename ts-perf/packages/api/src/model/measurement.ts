import { HostSpecifier } from "./hostSpecifier";
import { HostSpecifierComponents } from "./hostSpecifierComponents";
import { MeasurementComparison } from "./measurementComparison";
import { MeasurementPivot } from "./measurementPivot";
import { isSampleKey, SampleKey } from "./sample";
import { Value, ValueComponents } from "./value";

export interface MeasurementComponents extends Partial<Record<SampleKey, Value | ValueComponents>> {
    scenarioName?: string;
    scenarioIndex?: number;
    host?: HostSpecifier | HostSpecifierComponents;
    hostIndex?: number;
}

const hasOwnProperty = Object.prototype.hasOwnProperty;
function hasProperty(map: {}, key: string): boolean {
    return hasOwnProperty.call(map, key);
}

export class Measurement {
    constructor(
        public readonly scenarioName?: string,
        public readonly scenarioIndex?: number,
        public readonly host?: HostSpecifier,
        public readonly hostIndex?: number,
        public readonly values?: Partial<Record<string, Value>>,
    ) {
    }

    public get name() {
        return `${this.scenarioName} - ${this.hostName}`;
    }
    public get hostName() {
        return this.host && this.host.toDisplayString();
    }

    public static create(components: Measurement | MeasurementComponents): Measurement {
        if (components instanceof Measurement) {
            return components;
        }
        const values: Partial<Record<string, Value>> = {};
        for (const key in components) {
            if (hasProperty(components, key) && isSampleKey(key)) {
                const value = components[key];
                values[key] = value && Value.create(value);
            }
        }
        return new Measurement(
            components.scenarioName,
            components.scenarioIndex,
            components.host && HostSpecifier.create(components.host),
            components.hostIndex,
            values,
        );
    }

    public getComponents(): MeasurementComponents {
        return {
            scenarioName: this.scenarioName,
            scenarioIndex: this.scenarioIndex,
            host: this.host,
            hostIndex: this.hostIndex,
            ...this.values,
        };
    }

    public with(components: Partial<MeasurementComponents>) {
        const { scenarioName = this.scenarioName } = components;
        const { scenarioIndex = this.scenarioIndex } = components;
        const { hostIndex = this.hostIndex } = components;
        const { host = this.host } = components;
        const values: Partial<Record<string, ValueComponents>> = { ...this.values };
        let equalValues = true;
        for (const key in components) {
            if (hasProperty(components, key) && isSampleKey(key)) {
                const value = components[key];
                if (value && values[key] !== value) {
                    equalValues = false;
                    values[key] = value && Value.create(value);
                }
            }
        }
        if (
            this.scenarioName === scenarioName
            && this.scenarioIndex === scenarioIndex
            && this.hostIndex === hostIndex
            && this.host === host
            && equalValues
        ) {
            return this;
        }
        return Measurement.create({
            scenarioName,
            scenarioIndex,
            host,
            hostIndex,
            ...values,
        });
    }

    public static diff(benchmark: Measurement | undefined, baseline: Measurement | undefined, midline?: Measurement) {
        return benchmark && benchmark.diff(baseline, midline);
    }

    public diff(baseline: Measurement | undefined, midline?: Measurement) {
        return baseline || midline ? new MeasurementComparison(this, baseline, midline) : undefined;
    }

    public pivot() {
        const pivots: MeasurementPivot[] = [];
        for (const key in this.values) {
            if (hasProperty(this.values, key)) {
                const value = this.values[key];
                if (value) {
                    pivots.push(new MeasurementPivot(this, value));
                }
            }
        }
        return pivots;
    }

    public merge(other: Measurement): Measurement {
        if (
            this.scenarioName !== other.scenarioName
            || this.hostName !== other.hostName
            || this.hostIndex !== other.hostIndex
            || this.scenarioIndex !== other.scenarioIndex
        ) {
            throw Error("Cannot merge measurements with different scenarios or hosts.");
        }

        if (!this.values) return other;
        if (!other.values) return this;
        const thisKeys = Object.getOwnPropertyNames(this.values);
        const otherKeys = Object.getOwnPropertyNames(other.values);

        if (thisKeys.length !== otherKeys.length) {
            throw Error("Cannot merge measurements with different value keys.");
        }

        const values: Partial<Record<string, Value>> = {};
        for (const key of thisKeys) {
            if (!otherKeys.includes(key)) {
                throw Error("Cannot merge measurements with different value keys.");
            }
            values[key] = this.values[key]!.merge(other.values[key]!);
        }

        return this.with({ ...values });
    }

    public toJSON(): any {
        return {
            name: this.name,
            scenarioName: this.scenarioName,
            scenarioArgs: this.scenarioIndex,
            hostName: this.hostName,
            hostIndex: this.hostIndex,
            host: this.host,
            ...this.values,
        };
    }
}
