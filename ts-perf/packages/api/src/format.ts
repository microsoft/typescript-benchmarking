import * as chalk from "chalk";
import stripColor from "strip-ansi";

import { Benchmark, Host, MeasurementComparisonPivot, MeasurementPivot, Scenario, Value } from "./model";
import { TimeSpan } from "./types";

export function formatMean(measurement: Value | MeasurementPivot) {
    if (measurement.samples.length > 1) {
        return formatUnit(measurement.mean, measurement) + " (±"
            + formatPercent(measurement.relativeMarginOfError, /*sign*/ false, 6) + ")";
    }
    else {
        return formatUnit(measurement.mean, measurement);
    }
}

export function formatPValue(p: number, current: Value | MeasurementPivot, baseline: Value | MeasurementPivot) {
    const n1 = baseline.samples.length;
    const n2 = current.samples.length;
    return `p=${p.toFixed(3)} n=${n1 === n2 ? n1 : `${n1}+${n2}`}`;
}

export function formatDelta(
    current: Value | MeasurementPivot,
    baseline: Value | MeasurementPivot,
    isSignificant: boolean,
) {
    if (!isSignificant) {
        return "~";
    }

    const delta = current.mean - baseline.mean;
    const relativeDelta = delta / baseline.mean;
    return formatUnit(delta, current, /*sign*/ true) + " (" + formatPercent(relativeDelta, /*sign*/ true, 6) + ")";
}

const percentFormat = new Intl.NumberFormat("en-US", {
    style: "percent",
    useGrouping: true,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
});

export function formatPercent(value: number, options?: { sign?: boolean; pad?: number; color?: chalk.Chalk; }): string;
export function formatPercent(value: number, sign?: boolean, pad?: number): string;
export function formatPercent(
    value: number,
    options: { sign?: boolean; pad?: number; color?: chalk.Chalk; } | boolean = {},
    pad?: number,
) {
    if (typeof options !== "object") options = { sign: options, pad };
    let prefix = options.sign ? value > 0 ? "+" : value < 0 ? "-" : " " : "";
    if (options.sign) value = Math.abs(value);
    let text = percentFormat.format(value);
    if (options.color) {
        text = options.color(text);
        if (prefix) prefix = options.color(prefix);
    }
    if (options.pad) text = padLeft(text, options.pad);
    return `${prefix}${text}`;
}

const millisecondsFormat = new Intl.NumberFormat("en-US", {
    style: "decimal",
    useGrouping: true,
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
});

export function formatMilliseconds(
    value: TimeSpan | number,
    { sign = false, pad = 0 }: { sign?: boolean; pad?: number; } = {},
) {
    if (typeof value !== "number") value = value.totalMilliseconds;
    const prefix = sign ? value > 0 ? "+" : value < 0 ? "-" : " " : "";
    if (sign) value = Math.abs(value);
    return `${prefix}${padLeft(millisecondsFormat.format(value), pad)} ms`;
}

export function formatUnit(value: number, options: { precision: number; unit?: string; }, sign?: boolean) {
    return (sign && value > 0 ? "+" : "") + formatNumber(value, options.precision) + (options.unit || "");
}

function formatNumber(value: number, precision: number) {
    const parts = (+value).toFixed(precision).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}

export function formatProgress(index: number, length: number) {
    const indexText = String(index + 1);
    const lengthText = String(length);
    return `[${padLeft(indexText, lengthText.length, " ")}/${lengthText}]`;
}

export function padLeft(text: string, size: number, ch = " ") {
    let length = stripColor(text).length;
    const charLength = stripColor(ch).length;
    while (length < size) {
        text = ch + text;
        length += charLength;
    }
    return text;
}

export function padRight(text: string, size: number, ch = " ") {
    let length = stripColor(text).length;
    const charLength = stripColor(ch).length;
    while (length < size) {
        text = text + ch;
        length += charLength;
    }
    return text;
}

export function formatScenarioAndTestHostFromMeasurement(benchmark: Benchmark, measurement: MeasurementPivot) {
    if (benchmark.hosts && benchmark.scenarios) {
        return formatScenarioAndTestHost(
            benchmark.scenarios[measurement.scenarioIndex!],
            benchmark.hosts[measurement.hostIndex!],
        );
    }
}

export function formatScenarioAndTestHost(scenario: Scenario, testHost: Host) {
    return `${scenario.name} - ${formatTestHost(testHost)}`;
}

export function formatTestHost(testHost: Host) {
    let name = testHost.name;
    if (testHost.version || testHost.arch) {
        name += " (";
        if (testHost.version) {
            name += testHost.version;
            if (testHost.arch) {
                name += ", ";
            }
        }
        if (testHost.arch) {
            name += testHost.arch;
        }
        name += ")";
    }
    return name;
}

export function formatComparisonMetric(comparison: MeasurementComparisonPivot) {
    return comparison.metric || comparison.name;
}

export function formatComparisonBaseline(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.baseline!);
}

export function formatComparisonMidline(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.midline!);
}

export function formatComparisonCurrent(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.benchmark);
}

export function formatComparisonBaselineDelta(comparison: MeasurementComparisonPivot) {
    return formatDelta(comparison.benchmark, comparison.baseline!, comparison.baselineRelativeIsSignificant);
}

export function formatComparisonMidlineDelta(comparison: MeasurementComparisonPivot) {
    return formatDelta(comparison.benchmark, comparison.midline!, comparison.midlineRelativeIsSignificant);
}

export function formatComparisonBaselinePValue(comparison: MeasurementComparisonPivot) {
    return formatPValue(comparison.baselineRelativePValue, comparison.benchmark, comparison.baseline!);
}

export function formatComparisonMidlinePValue(comparison: MeasurementComparisonPivot) {
    return formatPValue(comparison.midlineRelativePValue, comparison.benchmark, comparison.midline!);
}

export function formatComparisonBest(comparison: MeasurementComparisonPivot) {
    return formatUnit(comparison.benchmark.minimum, comparison.benchmark);
}

export function formatComparisonWorst(comparison: MeasurementComparisonPivot) {
    return formatUnit(comparison.benchmark.maximum, comparison.benchmark);
}
