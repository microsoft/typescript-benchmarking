import { Benchmark, BenchmarkComparison } from "@ts-perf/api";

import { BenchmarkOptions } from "../";
import * as console from "./console";
import * as html from "./html";
import * as markdown from "./markdown";

export function printComparison(
    comparison: BenchmarkComparison,
    options: BenchmarkOptions,
    out: NodeJS.WritableStream,
) {
    switch (options.format) {
        case "console":
            console.printComparison(comparison, options, out);
            break;
        case "markdown":
            markdown.printComparison(comparison, options, out);
            break;
        case "html":
        case "html-fragment":
            html.printComparison(comparison, options, out);
            break;
    }
}

export function printBenchmark(benchmark: Benchmark, options: BenchmarkOptions, out: NodeJS.WritableStream) {
    switch (options.format) {
        case "console":
            console.printBenchmark(benchmark, options, out);
            break;

        case "markdown":
            markdown.printBenchmark(benchmark, options, out);
            break;

        case "html":
        case "html-fragment":
            html.printBenchmark(benchmark, options, out);
            break;
    }
}
