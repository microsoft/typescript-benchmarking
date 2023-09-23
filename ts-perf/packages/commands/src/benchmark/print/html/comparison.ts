import {
    Benchmark,
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
    formatTestHost,
    formatUnit,
    Host,
    Measurement,
    MeasurementComparisonPivot,
} from "@ts-perf/api";
import { SystemInfo } from "@ts-perf/core";
import { from, Query } from "iterable-query";

import { BenchmarkOptions } from "../../";
import { ClassNames, html, Range } from "./html";

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
    if (options.format === "html") {
        out.write(
            html`
<html>
<head>
<title>Benchmark comparison report${subtitle ? ` - ${subtitle}` : ``}</title>
${buildStyles()}
</head>
<body>
${buildBody(comparison, options, subtitle, /*noStyles*/ false)}
</body>
</html>`
                .trim() + "\n",
        );
    }
    else if (options.format === "html-fragment") {
        out.write(
            html`
${buildBody(comparison, options, subtitle, /*noStyles*/ true)}`
                .trimLines() + "\n",
        );
    }
}

function buildStyles() {
    return html`
    <style>
        body {
            font-family: Consolas;
            font-size: 1em;
        }
        table.system {
            font-family: Consolas;
            font-size: 1em;
            margin-bottom: 1em;
            margin-top: 1em;
        }
        table.system th {
            text-align: right;
            padding-right: 5px;
        }
        table.system td {
            text-align: left;
            padding-left: 5px;
        }
        table.summary {
            font-family: Consolas;
            font-size: 1em;
            margin-bottom: 1em;
            margin-top: 1em;
        }
        table.summary th {
            text-align: left;
            padding-right: 5px;
        }
        table.summary td {
            padding-right: 5px;
        }
        table.comparison {
            font-family: Consolas;
            font-size: 1em;
            border: 1px solid black;
            border-collapse: collapse;
            white-space: pre;
            margin-top: 1em;
            margin-bottom: 1em;
        }
        table.comparison th,
        table.comparison td {
            border-left: 1px solid black;
            border-right: 1px solid black;
            padding-left: 10px;
            padding-right: 10px;
        }
        table.comparison tr.group th {
            text-align: left;
            border-top: 3px double black;
            border-bottom: 3px double black;
            color: darkcyan;
            padding-top: 5px;
            padding-bottom: 5px;
        }
        table.comparison .metric {
            text-align: left;
        }
        table.comparison .mean,
        table.comparison .delta,
        table.comparison .best,
        table.comparison .worst,
        table.comparison .p-value {
            text-align: right;
        }
        table.comparison tr.memory td {
            border-bottom: 1px dotted black;
        }
        table.comparison tr.total td {
            border-top: 1px dotted black;
        }
        table.comparison tr.great,
        table.comparison td.great {
            background-color: rgb(198, 239, 206);
            color: rgb(0, 97, 0);
            font-weight: bold;
        }
        table.comparison tr.good,
        table.comparison td.good {
            background-color: rgb(198, 239, 206);
            color: rgb(0, 97, 0);
        }
        table.comparison tr.neutral,
        table.comparison td.neutral {
            background-color: rgb(255, 235, 156);
            color: rgb(156, 101, 0);
        }
        table.comparison tr.bad,
        table.comparison td.bad {
            background-color: rgb(255, 199, 206);
            color: rgb(156, 0, 6);
        }
    </style>`
        .trim();
}

function buildBody(comparison: BenchmarkComparison, options: BenchmarkOptions, subtitle: string, noStyles: boolean) {
    return html`
    ${formatReport(comparison, options, subtitle, noStyles)}
    ${formatSystemInfo(comparison.benchmark.system, noStyles)}
    ${formatHosts(comparison.benchmark.hosts, noStyles)}
    ${formatScenarios(comparison.benchmark.measurements, noStyles)}
    ${formatSummary(comparison, options, noStyles)}
    `.trim();
}

function getBenchmarkName(benchmark: Benchmark, preferredName: string, defaultName: string) {
    if (preferredName) return preferredName;
    if (benchmark.repository && benchmark.repository.branch) return benchmark.repository.branch;
    return defaultName;
}

function formatCell(noStyles: boolean, value: any) {
    return noStyles ? html`<sub>${value}</sub>` : value;
}

function formatSystemInfo(system: SystemInfo | undefined, noStyles: boolean) {
    if (!system?.cpus) {
        return html`
        <div>
            <b>System info unknown</b>
        </div>
        `.trim();
    }

    const cell = formatCell.bind(undefined, noStyles);
    const cpus = Query
        .from(system.cpus)
        .groupBy(cpu => cpu.model, cpu => cpu.speed, (model, speeds) => `${speeds.count()} × ${model}`)
        .toArray()
        .join(", ");

    return html`
    <div>
        <b>System</b>
        <table cellpadding="0" cellspacing="0" border="0" ${noStyles ? "" : `class="system"`}>
            <tr><th ${noStyles ? "align=right" : ""}>${cell("Machine Name")}</th><td>${cell(system.hostname)}</td></tr>
            <tr><th ${noStyles ? "align=right" : ""}>${cell("Platform")}</th><td>${
        cell(`${system.platform} ${system.release || ""}`)
    }</td></tr>
            <tr><th ${noStyles ? "align=right" : ""}>${cell("Architecture")}</th><td>${cell(system.arch)}</td></tr>
            <tr><th ${noStyles ? "align=right" : ""}>${cell("Available Memory")}</th><td>${
        cell(formatUnit(system.totalmem! / 1024 ** 3, { precision: 0, unit: " GB" }))
    }</td></tr>
            ${
        system.freemem
            ? html`<tr><th ${noStyles ? "align=right" : ""}>${cell("Available Memory")}</th><td>${
                cell(formatUnit(system.freemem / 1024 ** 3, { precision: 0, unit: " GB" }))
            }</td></tr>` : ``
    }
            <tr><th ${noStyles ? "align=right" : ""}>${cell("CPUs")}</th><td>${cell(cpus)}</td></tr>
        </table>
    </div>
    `.trim();
}

function formatHosts(hosts: readonly Host[], noStyles: boolean) {
    return html`
    <div>
        <b>Hosts</b>
        <ul>${
        hosts.map(host =>
            html`
            <li>${formatTestHost(host)}</li>`
        )
    }
        </ul>
    </div>
    `.trim();
}

function formatScenarios(scenarios: readonly Measurement[], noStyles: boolean) {
    return html`
    <div>
        <b>Scenarios</b>
        <ul>${
        scenarios.map(scenario =>
            html`
            <li>${scenario.name}</li>`
        )
    }
        </ul>
    </div>
    `.trim();
}

function formatReport(comparison: BenchmarkComparison, options: BenchmarkOptions, subtitle: string, noStyles: boolean) {
    const relativeMarginOfErrorClassNameRanges: Record<string, Range> = {
        bad: Range.after((options.marginOfErrorBad ?? 10) / 100),
        neutral: Range.after((options.marginOfErrorNeutral ?? 5) / 100),
    };

    const relativeDeltaClassNameRanges: Record<string, Range> = {
        bad: Range.after((options.relativeDeltaBad ?? 4) / 100),
        neutral: Range.after((options.relativeDeltaNeutral ?? 2) / 100),
        good: Range.before((options.relativeDeltaGood ?? -3) / 100),
        great: Range.before((options.relativeDeltaGreat ?? -30) / 100),
    };

    const cell = formatCell.bind(undefined, noStyles);
    const baseMark = getBaselineDeltaMarkers.bind(undefined, noStyles, relativeDeltaClassNameRanges);
    const midMark = getMidlineDeltaMarkers.bind(undefined, noStyles, relativeDeltaClassNameRanges);
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

    return html`
    <b>Comparison Report${subtitle ? ` - ${subtitle}` : ``}</b>
    <table border="0" cellpadding="0" cellspacing="0" ${noStyles ? "" : `class="comparison"`}>
        <thead>
            <tr>
                <th ${noStyles ? "align=left" : `class="metric"`}>${cell("Metric")}</th>
                ${
        baseline
            ? html`<th ${noStyles ? "align=right" : `class="baseline mean"`}>${cell(baselineName || `Baseline`)}</th>`
            : ``
    }
                ${
        midline ? html`<th ${noStyles ? "align=right" : `class="midline mean"`}>${cell(midlineName || `Midline`)}</th>`
            : ``
    }
                <th ${noStyles ? "align=right" : `class="current mean"`}>${cell(benchmarkName || "Current")}</th>
                ${
        baseline
            ? html`<th ${noStyles ? "align=right" : `class="baseline delta"`}>${
                cell(midline ? `Delta (B)` : `Delta`)
            }</th>` : ``
    }
                ${
        midline
            ? html`<th ${noStyles ? "align=right" : `class="midline delta"`}>${
                cell(baseline ? `Delta (M)` : `Delta`)
            }</th>` : ``
    }
                <th ${noStyles ? "align=right" : `class="current best"`}>${cell("Best")}</th>
                <th ${noStyles ? "align=right" : `class="current worst"`}>${cell("Worst")}</th>
                ${
        baseline
            ? html`<th ${noStyles ? "align=right" : `class="baseline p-value"`}>${
                cell(midline ? `p-value (B)` : `p-value`)
            }</th>` : ``
    }
                ${
        midline
            ? html`<th ${noStyles ? "align=right" : `class="midline p-value"`}>${
                cell(baseline ? `p-value (M)` : `p-value`)
            }</th>` : ``
    }
            </tr>
        </thead>${
        measurements
            .groupBy(measurement => measurement.measurementName)
            .select(group =>
                html`
        <tr class="group"><th ${noStyles ? "align=left" : ""} colspan="${5 + (baseline ? 2 : 0) + (midline ? 2 : 0)}">${
                    cell(group.key)
                }</th></tr>
        <tbody>${
                    from(group).select(measurement =>
                        html`
            <tr class="${getMeasurementClassNames(measurement)}">
                <td ${noStyles ? "align=left" : `class="${getMetricClassNames(measurement)}"`}>${
                            cell(formatComparisonMetric(measurement))
                        }</td>
                ${
                            baseline
                                ? html`<td ${
                                    noStyles ? "align=right"
                                        : `class="${
                                            getBaselineMeanClassNames(measurement, relativeMarginOfErrorClassNameRanges)
                                        }"`
                                }>${cell(formatComparisonBaseline(measurement))}</td>` : ``
                        }
                ${
                            midline
                                ? html`<td ${
                                    noStyles ? "align=right"
                                        : `class="${
                                            getMidlineMeanClassNames(measurement, relativeMarginOfErrorClassNameRanges)
                                        }"`
                                }>${cell(formatComparisonMidline(measurement))}</td>` : ``
                        }
                <td ${
                            noStyles ? "align=right"
                                : `class="${
                                    getCurrentMeanClassNames(measurement, relativeMarginOfErrorClassNameRanges)
                                }"`
                        }>${cell(formatComparisonCurrent(measurement))}</td>
                ${
                            baseline
                                ? html`<td ${
                                    noStyles ? "align=right"
                                        : `class="${
                                            getBaselineDeltaClassNames(measurement, relativeDeltaClassNameRanges)
                                        }"`
                                }>${cell(baseMark(measurement) + formatComparisonBaselineDelta(measurement))}</td>` : ``
                        }
                ${
                            midline
                                ? html`<td ${
                                    noStyles ? "align=right"
                                        : `class="${
                                            getMidlineDeltaClassNames(measurement, relativeDeltaClassNameRanges)
                                        }"`
                                }>${cell(midMark(measurement) + formatComparisonMidlineDelta(measurement))}</td>` : ``
                        }
                <td ${noStyles ? "align=right" : `class="current best"`}>${cell(formatComparisonBest(measurement))}</td>
                <td ${noStyles ? "align=right" : `class="current worst"`}>${
                            cell(formatComparisonWorst(measurement))
                        }</td>
                ${
                            baseline
                                ? html`<td ${
                                    noStyles ? "align=right" : `class="${getPValueClassNames(measurement)}"`
                                }>${cell(formatComparisonBaselinePValue(measurement))}</td>` : ``
                        }
                ${
                            midline
                                ? html`<td ${
                                    noStyles ? "align=right" : `class="${getPValueClassNames(measurement)}"`
                                }>${cell(formatComparisonMidlinePValue(measurement))}</td>` : ``
                        }
            </tr>`
                    )
                }
        </tbody>`
            )
    }
    </table>`;
}

function formatSummary(comparison: BenchmarkComparison, options: BenchmarkOptions, noStyles: boolean) {
    const cell = formatCell.bind(undefined, noStyles);
    return html`
    <div>
        <table cellspacing="0" cellpadding="0" border="0" ${noStyles ? "" : `class="summary"`}>
            <tr>
                <th ${noStyles ? "align=left" : ""}>${cell("Benchmark")}</th>
                <th ${noStyles ? "align=left" : ""}>${cell("Name")}</th>
                <th ${noStyles ? "align=left" : ""}>${cell("Iterations")}</th>
            </tr>
            <tr>
                <td>${cell("Current")}</td>
                <td>${cell(options.benchmarkName !== "Current" ? options.benchmarkName : "")}</td>
                <td>${cell(comparison.benchmark.iterations || 0)}</td>
            </tr>${
        comparison.midline ? html`
            <tr>
                <td>${cell("Midline")}</td>
                <td>${cell(options.midlineName !== "Midline" ? options.midlineName : "")}</td>
                <td>${cell(comparison.midline.iterations || 0)}</td>
            </tr>` : ``
    }${
        comparison.baseline ? html`
            <tr>
                <td>${cell("Baseline")}</td>
                <td>${cell(options.baselineName !== "Baseline" ? options.baselineName : "")}</td>
                <td>${cell(comparison.baseline.iterations || 0)}</td>
            </tr>` : ``
    }
        </table>
    </div>
    `.trim();
}

function getMetricClassNames(measurement: MeasurementComparisonPivot) {
    return new ClassNames("metric")
        .toString();
}

function getBaselineMeanClassNames(measurement: MeasurementComparisonPivot, ranges: Record<string, Range>) {
    return new ClassNames("baseline", "mean")
        .addRange(measurement.baseline!.relativeMarginOfError, ranges)
        .toString();
}

function getMidlineMeanClassNames(measurement: MeasurementComparisonPivot, ranges: Record<string, Range>) {
    return new ClassNames("midline", "mean")
        .addRange(measurement.midline!.relativeMarginOfError, ranges)
        .toString();
}

function getCurrentMeanClassNames(measurement: MeasurementComparisonPivot, ranges: Record<string, Range>) {
    return new ClassNames("current", "mean")
        .addRange(measurement.benchmark.relativeMarginOfError, ranges)
        .toString();
}

function getPValueClassNames(measurement: MeasurementComparisonPivot) {
    return new ClassNames("p-value")
        .toString();
}

function getBaselineDeltaMarkers(
    noStyles: boolean,
    ranges: Record<string, Range>,
    measurement: MeasurementComparisonPivot,
) {
    if (!noStyles) return "";
    const classNames = getBaselineDeltaClassNames(measurement, ranges);
    let markers = "";
    for (const className of classNames.classNames) {
        switch (className) {
            case "bad":
                markers += "🔻";
                break;
            case "good":
                markers += "🟩";
                break;
            case "great":
                markers += "🚀";
                break;
        }
    }
    return markers;
}

function getMidlineDeltaMarkers(
    noStyles: boolean,
    ranges: Record<string, Range>,
    measurement: MeasurementComparisonPivot,
) {
    if (!noStyles) return "";
    const classNames = getMidlineDeltaClassNames(measurement, ranges);
    let markers = "";
    for (const className of classNames.classNames) {
        switch (className) {
            case "bad":
                markers += "🔻";
                break;
            case "good":
                markers += "🟩";
                break;
            case "great":
                markers += "🚀";
                break;
        }
    }
    return markers;
}

function getBaselineDeltaClassNames(measurement: MeasurementComparisonPivot, ranges: Record<string, Range>) {
    return new ClassNames("baseline", "delta")
        .addRangeIf(
            measurement.baselineRelativeIsSignificant,
            measurement.baselineRelativeDelta,
            ranges,
        );
}

function getMidlineDeltaClassNames(measurement: MeasurementComparisonPivot, ranges: Record<string, Range>) {
    return new ClassNames("midline", "delta")
        .addRangeIf(
            measurement.midlineRelativeIsSignificant,
            measurement.midlineRelativeDelta,
            ranges,
        );
}

function getMeasurementClassNames(measurement: MeasurementComparisonPivot) {
    return new ClassNames("measurement")
        .addIf(measurement.metric === "Memory used", "memory")
        .addIf(measurement.metric === "Parse Time", "parse-time")
        .addIf(measurement.metric === "Bind Time", "bind-time")
        .addIf(measurement.metric === "Check Time", "check-time")
        .addIf(measurement.metric === "Emit Time", "emit-time")
        .addIf(measurement.metric === "Total Time", "total")
        .add(`scenario${measurement.measurement.benchmark.scenarioIndex || 0}`)
        .add(`host${measurement.measurement.benchmark.hostIndex || 0}`);
}

// function getGroupClassNames(group: Grouping<string, MeasurementComparisonPivot>) {
//     return new ClassNames("group")
//         .add(
//             ...from(group)
//                 .select(measurement => measurement.measurement.benchmark.hostIndex || 0)
//                 .distinct()
//                 .map(hostIndex => `host${hostIndex}`),
//         )
//         .add(
//             ...from(group)
//                 .select(measurement => measurement.measurement.benchmark.scenarioIndex || 0)
//                 .distinct()
//                 .map(scenarioIndex => `scenario${scenarioIndex}`),
//         );
// }

// function getMetricClass(metric: string) {
//     if (metric === "Memory used") return "memory";
//     if (metric === "Total Time") return "total";
//     return "";
// }
