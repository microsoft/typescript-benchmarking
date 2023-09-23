import {
    Benchmark,
    BenchmarkComparison,
    formatComparisonBest,
    formatComparisonMetric,
    formatComparisonWorst,
    formatPercent,
    formatTestHost,
    formatUnit,
    Host,
    Measurement,
    MeasurementComparisonPivot,
    MeasurementPivot,
    Value,
} from "@ts-perf/api";
import { SystemInfo } from "@ts-perf/core";
import { from, Query } from "iterable-query";

import { BenchmarkOptions } from "../../";
import { markdown } from "./markdown";

export function printComparison(
    comparison: BenchmarkComparison,
    options: BenchmarkOptions,
    out: NodeJS.WritableStream,
) {
    let subtitle = "";
    if (options.baseline || options.midline) {
        options.benchmarkName = getBenchmarkName(comparison.benchmark, options.benchmarkName!, "Current");
        subtitle = options.benchmarkName;
        if (options.midline) {
            options.midlineName = getBenchmarkName(comparison.midline!, options.midlineName!, "Midline");
            subtitle = options.midlineName + ".." + subtitle;
        }
        if (options.baseline) {
            options.baselineName = getBenchmarkName(comparison.baseline!, options.baselineName!, "Baseline");
            subtitle = options.baselineName + ".." + subtitle;
        }
    }
    out.write(markdown`${buildBody(comparison, options, subtitle)}`.toString());
}

function buildBody(comparison: BenchmarkComparison, options: BenchmarkOptions, subtitle: string) {
    return markdown`
${formatReport(comparison, options, subtitle)}
${formatSystemInfo(comparison.benchmark.system)}
${formatHosts(comparison.benchmark.hosts)}
${formatScenarios(comparison.benchmark.measurements)}
${formatSummary(comparison, options)}`;
}

function getBenchmarkName(benchmark: Benchmark, preferredName: string, defaultName: string) {
    if (preferredName) return preferredName;
    if (benchmark.repository && benchmark.repository.branch) return benchmark.repository.branch;
    return defaultName;
}

function formatSystemInfo(system: SystemInfo | undefined) {
    if (!system?.cpus) {
        return markdown`
${markdown`**System**  `}
Unknown  \n`;
    }

    const cpus = Query
        .from(system.cpus)
        .groupBy(cpu => cpu.model, cpu => cpu.speed, (model, speeds) => `${speeds.count()} × ${model}`)
        .toArray()
        .join(", ");

    return markdown`
${markdown`**System**  `}
<table border="0" cellpadding="0" cellspacing="0">
<tbody>
<tr><th align="right">Machine Name</th><td>${system.hostname}</td></tr>
<tr><th align="right">Platform</th><td>${system.platform} ${system.release || ""}</td></tr>
<tr><th align="right">Architecture</th><td>${system.arch}</td></tr>
<tr><th align="right">Available Memory</th><td>${
        system.totalmem ? formatUnit(system.totalmem / 1024 ** 3, { precision: 0, unit: " GB" }) : "unknown"
    }</td></tr>
<tr><th align="right">CPUs</th><td>${cpus}</td></tr>
</tbody>
</table>  \n`;
}

function formatHosts(hosts: readonly Host[]) {
    return markdown`
${markdown`**Hosts**  `}
${hosts.map(host => markdown`\n* ${formatTestHost(host)}\n`)}  \n`;
}

function formatScenarios(scenarios: readonly Measurement[]) {
    return markdown`
${markdown`**Scenarios**  `}
${scenarios.map(scenario => markdown`\n* ${scenario.name}\n`)}  \n`;
}

function formatReport(comparison: BenchmarkComparison, options: BenchmarkOptions, subtitle: string) {
    const benchmarkName = options.benchmarkName;
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

    return markdown`
${markdown`**Comparison Report${subtitle ? ` - ${subtitle}` : ``}**  `}
<table border="0" cellpadding="0" cellspacing="0">
<thead>
<tr>
<th align="left">Metric</th>
${baseline ? markdown`<th align="right">${baselineName || `Baseline`}</th>` : undefined}
${midline ? markdown`<th align="right">${midlineName || `Midline`}</th>` : undefined}
<th align=right>${benchmarkName || "Current"}</th>
${baseline ? markdown`<th align="right">Delta${midline ? ` (B)` : ``}</th>` : undefined}
${midline ? markdown`<th align="right">Delta${baseline ? ` (M)` : ``}</th>` : undefined}
<th align="right">Best</th>
<th align="right">Worst</th>
${baseline ? markdown`<th align="right">p-value${midline ? ` (B)` : ``}</th>` : undefined}
${midline ? markdown`<th align="right">p-value${baseline ? ` (M)` : ``}</th>` : undefined}
</tr>
</thead>
${
        measurements.groupBy(measurement => measurement.measurementName).select(group =>
            markdown`
<tr><th align="left" colspan="${5 + (baseline ? 2 : 0) + (midline ? 2 : 0)}">${group.key}</th></tr>
<tbody>${
                from(group).select(measurement =>
                    markdown`
<tr>
<td align="left" valign="middle"><nobr>${formatComparisonMetric(measurement)}</nobr></td>
${baseline ? markdown`<td align="right" valign="top">${formatComparisonBaseline(measurement)}</td>` : undefined}
${midline ? markdown`<td align="right" valign="top">${formatComparisonMidline(measurement)}</td>` : undefined}
<td align="right" valign="top">${formatComparisonCurrent(measurement)}</td>
${baseline ? markdown`<td align="right" valign="top">${formatComparisonBaselineDelta(measurement)}</td>` : undefined}
${midline ? markdown`<td align="right" valign="top">${formatComparisonMidlineDelta(measurement)}</td>` : undefined}
<td align="right" valign="top">${formatComparisonBest(measurement)}</td>
<td align="right" valign="top">${formatComparisonWorst(measurement)}</td>
${baseline ? markdown`<td align="right" valign="top">${formatComparisonBaselinePValue(measurement)}</td>` : undefined}
${midline ? markdown`<td align="right" valign="top">${formatComparisonMidlinePValue(measurement)}</td>` : undefined}
</tr>`
                )
            }
</tbody>`
        )
    }
</table>  \n`;
}

function formatComparisonBaseline(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.baseline!);
}

function formatComparisonMidline(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.midline!);
}

function formatComparisonCurrent(comparison: MeasurementComparisonPivot) {
    return formatMean(comparison.benchmark);
}

function formatMean(measurement: Value | MeasurementPivot) {
    if (measurement.samples.length > 1) {
        return markdown`${formatUnit(measurement.mean, measurement)}<br /><sup>±${
            formatPercent(measurement.relativeMarginOfError, /*sign*/ false)
        }</sup>`;
    }
    else {
        return markdown`${formatUnit(measurement.mean, measurement)}`;
    }
}

function formatComparisonBaselineDelta(comparison: MeasurementComparisonPivot) {
    return formatDelta(comparison.benchmark, comparison.baseline!, comparison.baselineRelativeIsSignificant);
}

function formatComparisonMidlineDelta(comparison: MeasurementComparisonPivot) {
    return formatDelta(comparison.benchmark, comparison.midline!, comparison.midlineRelativeIsSignificant);
}

export function formatComparisonBaselinePValue(comparison: MeasurementComparisonPivot) {
    return formatPValue(comparison.baselineRelativePValue, comparison.benchmark, comparison.baseline!);
}

export function formatComparisonMidlinePValue(comparison: MeasurementComparisonPivot) {
    return formatPValue(comparison.midlineRelativePValue, comparison.benchmark, comparison.midline!);
}

export function formatPValue(p: number, current: Value | MeasurementPivot, baseline: Value | MeasurementPivot) {
    const n1 = baseline.samples.length;
    const n2 = current.samples.length;
    return `p=${p.toFixed(3)} n=${n1 === n2 ? n1 : `${n1}+${n2}`}`;
}

function formatDelta(current: Value | MeasurementPivot, baseline: Value | MeasurementPivot, isSignificant: boolean) {
    if (!isSignificant) {
        return "~";
    }

    const delta = current.mean - baseline.mean;
    const relativeDelta = delta / baseline.mean;
    return markdown`${formatUnit(delta, current, /*sign*/ true)}<br /><sup>${
        formatPercent(relativeDelta, /*sign*/ true)
    }</sup>`;
}

function formatSummary(comparison: BenchmarkComparison, options: BenchmarkOptions) {
    return markdown`
${markdown`**Summary**  `}
<table cellspacing="0" cellpadding="0" border="0">
<tr>
<th align="left">Benchmark</th>
<th align="left">Name</th>
<th align="left">Iterations</th>
</tr>
<tr>
<td>Current</td>
<td>${options.benchmarkName !== "Current" ? options.benchmarkName : ""}</td>
<td>${comparison.benchmark.iterations || 0}</td>
</tr>
${
        comparison.midline ? markdown`
<tr>
<td>Midline</td>
<td>${options.midlineName !== "Midline" ? options.midlineName : ""}</td>
<td>${comparison.midline.iterations || 0}</td>
</tr>` : undefined
    }
${
        comparison.baseline ? markdown`
<tr>
<td>Baseline</td>
<td>${options.baselineName !== "Baseline" ? options.baselineName : ""}</td>
<td>${comparison.baseline.iterations || 0}</td>
</tr>` : undefined
    }
</table>`;
}
