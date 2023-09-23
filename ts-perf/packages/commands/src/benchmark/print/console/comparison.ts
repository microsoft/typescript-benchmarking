import {
    BenchmarkComparison,
    formatComparisonBaseline,
    formatComparisonBaselineDelta,
    formatComparisonBaselinePValue,
    formatComparisonBest,
    formatComparisonCurrent,
    formatComparisonMetric,
    formatComparisonMidline,
    formatComparisonMidlineDelta,
    formatComparisonMidlinePValue,
    formatComparisonWorst,
    MeasurementComparisonPivot,
} from "@ts-perf/api";
import { Query } from "iterable-query";
import { Table } from "table-style";

import { BenchmarkOptions } from "../../";

export function printComparison(
    comparison: BenchmarkComparison,
    options: BenchmarkOptions,
    out: NodeJS.WritableStream,
) {
    const baselineName = options.baselineName;
    const midlineName = options.midlineName;
    const baseline = options.baseline;
    const midline = options.midline;
    const measurements = Query
        .from(comparison.measurements)
        .flatMap(measurement => measurement.pivot())
        .orderBy(measurement => measurement.scenarioIndex)
        .thenBy(measurement => measurement.hostIndex)
        .thenBy(measurement => measurement.metricIndex);

    const table = new Table<MeasurementComparisonPivot>({
        useColor: options.color,
        columns: [
            { header: "Project", key: "metric", expression: formatComparisonMetric },
            {
                header: baselineName ? midline ? baselineName + " (B)" : baselineName : "Baseline",
                expression: formatComparisonBaseline,
                align: "right",
                visible: baseline !== undefined,
            },
            {
                header: midlineName ? baseline ? midlineName + " (M)" : midlineName : "Midline",
                expression: formatComparisonMidline,
                align: "right",
                visible: midline !== undefined,
            },
            { header: "Current", expression: formatComparisonCurrent, align: "right" },
            {
                header: midline ? "Delta (B)" : "Delta",
                key: "delta",
                expression: formatComparisonBaselineDelta,
                align: "right",
                visible: baseline !== undefined,
            },
            {
                header: baseline ? "Delta (M)" : "Delta",
                key: "delta",
                expression: formatComparisonMidlineDelta,
                align: "right",
                visible: midline !== undefined,
            },
            { header: "Best", expression: formatComparisonBest, align: "right" },
            { header: "Worst", expression: formatComparisonWorst, align: "right" },
            {
                header: midline ? "p-value (B)" : "p-value",
                key: "p-value",
                expression: formatComparisonBaselinePValue,
                align: "right",
                visible: baseline !== undefined,
            },
            {
                header: baseline ? "p-value (M)" : "p-value",
                key: "p-value",
                expression: formatComparisonMidlinePValue,
                align: "right",
                visible: midline !== undefined,
            },
        ],
        group: [
            { by: x => `${x.measurementName}` },
        ],
        rowStyles: [
            "*",
            { className: "group header", border: { top: "double" }, foregroundColor: "cyan" },
            {
                className: "body",
                match: (x: MeasurementComparisonPivot) => x.benchmarkRelativeDelta < -0.1,
                foregroundColor: "green",
            },
            {
                className: "body",
                match: (x: MeasurementComparisonPivot) => x.benchmarkRelativeDelta > 0.1,
                foregroundColor: "yellow",
            },
            {
                className: "body",
                match: (x: MeasurementComparisonPivot) => x.benchmarkRelativeDelta > 0.3,
                foregroundColor: "red",
            },
            {
                className: "body",
                match: (x: MeasurementComparisonPivot) => x.metric === "Memory used",
                foregroundColor: "dark-gray",
            },
            {
                className: "body",
                match: (x: MeasurementComparisonPivot) => x.metric === "Total Time",
                border: { top: "single" },
            },
        ],
    });

    table.render(measurements, out);
}
