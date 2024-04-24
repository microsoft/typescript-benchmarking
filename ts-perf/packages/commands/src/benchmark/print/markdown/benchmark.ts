import { Benchmark, formatMean, formatTestHost, formatUnit, Host, Measurement } from "@ts-perf/api";
import { SystemInfo } from "@ts-perf/core";
import { from, Query } from "iterable-query";

import { BenchmarkOptions } from "../../";
import { markdown } from "./markdown";

export function printBenchmark(benchmark: Benchmark, options: BenchmarkOptions, out: NodeJS.WritableStream) {
    out.write(markdown`${buildBody(benchmark, options)}`.toString());
}

function buildBody(benchmark: Benchmark, options: BenchmarkOptions) {
    return markdown`
${formatReport(benchmark, options)}
${formatSystemInfo(benchmark.system)}
${formatHosts(benchmark.hosts)}
${formatScenarios(benchmark.measurements)}
${formatSummary(benchmark, options)}`;
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

function formatReport(benchmark: Benchmark, options: BenchmarkOptions) {
    const measurements = Query
        .from(benchmark.measurements)
        .flatMap(measurement => measurement.pivot())
        .orderBy(measurement => measurement.scenarioIndex)
        .thenBy(measurement => measurement.hostIndex)
        .thenBy(measurement => measurement.metricIndex);

    return markdown`
${markdown`**Benchmark Report**  `}
<table border="0" cellpadding="0" cellspacing="0">
<thead>
<tr>
<th align="left">Metric</th>
<th align="right">Average</th>
<th align="right">Best</th>
<th align="right">Worst</th>
</tr>
</thead>
${
        measurements.groupBy(measurement => measurement.measurementName).select(group =>
            markdown`
<tr><th align="left" colspan="4">${group.key}</th></tr>
<tbody>
${
                from(group).select(measurement =>
                    markdown`
<tr>
<td align="left">${measurement.metric}</td>
<td align="right">${formatMean(measurement)}</td>
<td align="right">${measurement.allSamplesEqual ? "~" : formatUnit(measurement.minimum, measurement)}</td>
<td align="right">${measurement.allSamplesEqual ? "~" : formatUnit(measurement.maximum, measurement)}</td>
</tr>`
                )
            }
</tbody>`
        )
    }
</table>  \n`;
}

function formatSummary(benchmark: Benchmark, options: BenchmarkOptions) {
    return markdown`
${markdown`**Summary**  `}
<table border="0" cellpadding="0" cellspacing="0">
<thead>
<tr>
<th align="left">Benchmark</th>
<th align="left">Iterations</th>
</tr>
</thead>
<tbody>
<tr>
<td>${options.benchmarkName || benchmark.repository && benchmark.repository.branch || "<unnamed>"}</td>
<td>${benchmark.iterations || 0}</td>
</tr>
</tbody>
</table>  \n`;
}
