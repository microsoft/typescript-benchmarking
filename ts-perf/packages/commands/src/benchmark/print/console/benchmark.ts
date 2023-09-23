import { Benchmark, formatMean, formatUnit, MeasurementPivot } from "@ts-perf/api";
import { Query } from "iterable-query";
import { Border, Table } from "table-style";

import { BenchmarkOptions } from "../../";

export function printBenchmark(benchmark: Benchmark, options: BenchmarkOptions, out: NodeJS.WritableStream) {
    const measurements = Query
        .from(benchmark.measurements)
        .flatMap(measurement => measurement.pivot())
        .orderBy(measurement => measurement.scenarioIndex)
        .thenBy(measurement => measurement.hostIndex)
        .thenBy(measurement => measurement.metricIndex);

    const table = new Table<MeasurementPivot>({
        useColor: options.color,
        group: [
            { by: x => x.measurementName },
        ],
        columns: [
            { header: "Project", key: "metric", expression: x => x.metric },
            { header: "Average", expression: x => formatMean(x), align: "right" },
            { header: "Best", expression: x => formatUnit(x.minimum, x), align: "right" },
            { header: "Worst", expression: x => formatUnit(x.maximum, x), align: "right" },
        ],
        rowStyles: [
            "*",
            { className: "group header", border: Border.single.updateFrom({ top: "double" }) },
            {
                className: "body",
                match: (x: MeasurementPivot) => x.metric === "Memory used",
                foregroundColor: "dark-gray",
            },
            { className: "body", match: (x: MeasurementPivot) => x.metric === "Total Time", border: { top: "single" } },
        ],
    });

    table.render(measurements, out);
}
