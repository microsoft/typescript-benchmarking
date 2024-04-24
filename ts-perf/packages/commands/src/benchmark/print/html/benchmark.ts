import { Benchmark, formatMean, formatTestHost, formatUnit, Host, Measurement, MeasurementPivot } from "@ts-perf/api";
import { SystemInfo } from "@ts-perf/core";
import { from, Query } from "iterable-query";

import { BenchmarkOptions } from "../../";
import { ClassNames, html, Range } from "./html";

export function printBenchmark(benchmark: Benchmark, options: BenchmarkOptions, out: NodeJS.WritableStream) {
    if (options.format === "html") {
        out.write(
            html`
<html>
<head>
<title>Benchmark report</title>
${buildStyles()}
</head>
<body>
${buildBody(benchmark, options, /*noStyles*/ false)}
</body>
</html>`.trim() + "\n",
        );
    }
    else if (options.format === "html-fragment") {
        out.write(html`${buildBody(benchmark, options, /*noStyles*/ true)}`.trimLines() + "\n");
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
        table.comparison .worst {
            text-align: right;
        }
        table.comparison tr.memory td {
            border-bottom: 1px dotted black;
        }
        table.comparison tr.total td {
            border-top: 1px dotted black;
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

function buildBody(benchmark: Benchmark, options: BenchmarkOptions, noStyles: boolean) {
    return html`
    ${formatReport(benchmark, options, noStyles)}
    ${formatSystemInfo(benchmark.system, noStyles)}
    ${formatHosts(benchmark.hosts, noStyles)}
    ${formatScenarios(benchmark.measurements, noStyles)}
    ${formatSummary(benchmark, options, noStyles)}
    `.trim();
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

function formatReport(benchmark: Benchmark, options: BenchmarkOptions, noStyles: boolean) {
    const cell = formatCell.bind(undefined, noStyles);
    const measurements = Query
        .from(benchmark.measurements)
        .flatMap(measurement => measurement.pivot())
        .orderBy(measurement => measurement.scenarioIndex)
        .thenBy(measurement => measurement.hostIndex)
        .thenBy(measurement => measurement.metricIndex);

    return html`
    <b>Benchmark Report</b>
    <table border="0" cellpadding="0" cellspacing="0" ${noStyles ? "" : `class="comparison"`}>
        <thead>
            <tr>
                <th ${noStyles ? "align=left" : `class="metric"`}>${cell("Metric")}</th>
                <th ${noStyles ? "align=right" : `class="current mean"`}>${cell("Average")}</th>
                <th ${noStyles ? "align=right" : `class="current best"`}>${cell("Best")}</th>
                <th ${noStyles ? "align=right" : `class="current worst"`}>${cell("Worst")}</th>
            </tr>
        </thead>${
        measurements
            .groupBy(measurement => measurement.measurementName)
            .select(group =>
                html`
        <tr class="group"><th ${noStyles ? "align=left" : ""} colspan="4">${cell(group.key)}</th></tr>
        <tbody>${
                    from(group).select(measurement =>
                        html`
            <tr class="${getMeasurementClassNames(measurement)}">
                <td ${noStyles ? "align=left" : `class="${getMetricClassNames(measurement)}"`}>${
                            cell(measurement.metric)
                        }</td>
                <td ${noStyles ? "align=right" : `class="${getCurrentMeanClassNames(measurement)}"`}>${
                            cell(formatMean(measurement))
                        }</td>
                <td ${noStyles ? "align=right" : `class="current best"`}>${
                            measurement.allSamplesEqual ? "~" : cell(formatUnit(measurement.minimum, measurement))
                        }</td>
                <td ${noStyles ? "align=right" : `class="current worst"`}>${
                            measurement.allSamplesEqual ? "~" : cell(formatUnit(measurement.maximum, measurement))
                        }</td>
            </tr>`
                    )
                }
        </tbody>`
            )
    }
    </table>`;
}

function formatSummary(benchmark: Benchmark, options: BenchmarkOptions, noStyles: boolean) {
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
                <td>${cell(benchmark.iterations || 0)}</td>
            </tr>
        </table>
    </div>
    `.trim();
}

function getMetricClassNames(measurement: MeasurementPivot) {
    return new ClassNames("metric");
}

function getCurrentMeanClassNames(measurement: MeasurementPivot) {
    return new ClassNames("current", "mean")
        .addRange(measurement.relativeMarginOfError, relativeMarginOfErrorClassNames);
}

function getMeasurementClassNames(measurement: MeasurementPivot) {
    return new ClassNames("measurement")
        .addIf(measurement.metric === "Memory used", "memory")
        .addIf(measurement.metric === "Parse Time", "parse-time")
        .addIf(measurement.metric === "Bind Time", "bind-time")
        .addIf(measurement.metric === "Check Time", "check-time")
        .addIf(measurement.metric === "Emit Time", "emit-time")
        .addIf(measurement.metric === "Total Time", "total")
        .add(`scenario${measurement.measurement.scenarioIndex}`)
        .add(`host${measurement.measurement.hostIndex}`);
}

const relativeMarginOfErrorClassNames = {
    bad: Range.after(0.10),
    neutral: Range.after(0.05),
};
