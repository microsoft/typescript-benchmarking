import * as fs from "node:fs";

import {
    AzureStorageOptions,
    Benchmark,
    Command,
    CommandMap,
    CompilerOptions,
    formatPercent,
    MeasurementComparison,
    StartupOptions,
    TSServerOptions,
} from "@ts-perf/api";
import { HostContext, LogEventType, ProcessExitError } from "@ts-perf/core";
import { CommandLineParseError } from "power-options";

import { measureAndRunScenarios } from "./measure";
import { printBenchmark, printComparison } from "./print";
import * as startup from "./startup";
import * as tsc from "./tsc";
import * as tsserver from "./tsserver";

export interface BenchmarkOptions extends AzureStorageOptions {
    hosts?: string[];
    scenarioConfigDirs?: string[];
    scenarios?: string[];
    load?: string;
    save?: string[];
    format?: "html" | "html-fragment" | "markdown" | "console";
    out?: string;
    baseline?: string;
    baselineName?: string;
    midline?: string;
    midlineName?: string;
    benchmarkName?: string;
    warmups?: number;
    iterations?: number;
    color?: boolean;
    date?: string;
    repositoryType?: string;
    repositoryUrl?: string;
    repositoryBranch?: string;
    repositoryCommit?: string;
    repositoryCommitSubject?: string;
    repositoryDate?: string;
    relativeDeltaBad?: number;
    relativeDeltaNeutral?: number;
    relativeDeltaGood?: number;
    relativeDeltaGreat?: number;
    marginOfErrorBad?: number;
    marginOfErrorNeutral?: number;
    errorOutOfRange?: boolean;
    errorRange?: number;
    cpus?: string;
    predictable?: boolean;
}

export type TSOptions =
    | { kind: "tsserver"; options: BenchmarkOptions & TSServerOptions; }
    | { kind: "tsc"; options: BenchmarkOptions & CompilerOptions; }
    | { kind: "startup"; options: BenchmarkOptions & StartupOptions; };

export async function benchmark(tsoptions: TSOptions, host: HostContext) {
    const { options } = tsoptions;
    if (options.iterations === undefined) {
        options.iterations = 5;
    }
    if (options.warmups === undefined) {
        options.warmups = 0;
    }

    if (options.baseline || options.midline) {
        host.info(`${options.load ? "Loading" : "Running"} benchmark and comparing to baseline.`);
    }
    else if (options.load) {
        host.info(`Loading benchmark file '${options.load}'.`);
    }
    else if (options.save) {
        host.info(`Creating new benchmark file '${options.save}'...`);
    }

    const benchmark = options.load
        ? await loadAsync(options.load)
        : await measureAndRunScenarios(tsoptions, host);

    const [baseline, midline] = await Promise.all([
        options.baseline ? loadAsync(options.baseline) : undefined,
        options.midline ? loadAsync(options.midline) : undefined,
    ]);

    let saved = false;
    if (options.save && options.save.length > 0) {
        await Promise.all(options.save.map(save => benchmark.saveAsync(save, options)));
        saved = true;
    }

    if (!saved || options.out || host.logger.isEnabled(LogEventType.Info)) {
        const outputStream = options.out
            ? fs.createWriteStream(options.out, { encoding: "utf8", autoClose: true })
            : undefined;

        if (outputStream) {
            outputStream.write("\ufeff", "utf8");
        }

        const errors: MeasurementComparison[] = [];
        if (baseline || midline) {
            const comparison = benchmark.diff(baseline, midline)!;
            printComparison(comparison, options, outputStream || host.outputStream!);
            if (options.errorOutOfRange) {
                for (const measurement of comparison.measurements) {
                    if (measurement.values.totalTime && measurement.values.totalTime.benchmarkRelativeDelta >= 0.1) {
                        errors.push(measurement);
                    }
                }
            }
        }
        else {
            printBenchmark(benchmark, options, outputStream || host.outputStream!);
        }

        if (outputStream) {
            await new Promise<void>(resolve => outputStream.end(() => resolve()));
        }

        if (errors.length) {
            for (const error of errors) {
                host.error(
                    `${error.name}/Total Time was outside of the allowed range (${
                        formatPercent(error.values.totalTime!.benchmarkRelativeDelta)
                    } worse than ${error.values.totalTime!.worst}).`,
                );
            }
            throw new ProcessExitError(-1, "A performance metric was out of range.");
        }
    }

    async function loadAsync(file: string) {
        const benchmark = await Benchmark.loadAsync(file, options);
        return benchmark.filter(options.scenarios || [], options.hosts || []);
    }
}

function validatePath(value: string, arg: string) {
    if (!/^blob:/.test(value) && !fs.existsSync(value)) {
        throw new CommandLineParseError(`Option '${arg}' path not found: '${value}'.`);
    }
}

function validateIterations(value: number, arg: string) {
    if (value <= 0) {
        throw new CommandLineParseError(`Option '${arg}' expects a positive, non-zero number.`, /*help*/ true);
    }
}

const command: Command<BenchmarkOptions> = {
    commandName: "benchmark",
    summary: "Load or run a benchmark.",
    description: "Load or run a benchmark and compare it to an optional baseline.",
    include: ["reporting", "azureStorage"],
    options: {
        out: {
            type: "string",
            description: "Output file",
        },
        format: {
            type: "string",
            defaultValue: "console",
            in: ["html", "html-fragment", "markdown", "console"],
            description: "Output format, either 'console' (default), 'html', or 'markdown'.",
        },
        color: {
            type: "boolean",
            defaultValue: true,
            description: "Determines whether to print results in color.",
        },
        date: {
            type: "string",
            param: "date",
            description: "The date to use for the benchmark.",
        },
        iterations: {
            type: "number",
            shortName: "i",
            alias: ["iter", "iteration"],
            param: "count",
            description: "Runs the benchmark for <count> iterations (default '5').",
            validate: validateIterations,
        },
        warmups: {
            type: "number",
            param: "count",
            description: "Runs the benchmark for <count> warmups (default '0').",
            validate: validateIterations,
        },
        save: {
            type: "string",
            shortName: "s",
            param: "file",
            multiple: true,
            description: "Saves the benchmark to <file>. Cannot be used with --load.",
        },
        load: {
            type: "string",
            shortName: "l",
            param: "file",
            description: "Loads the benchmark from <file>. Cannot be used with --save.",
            validate: validatePath,
        },
        baseline: {
            type: "string",
            shortName: "b",
            alias: "base",
            param: "file",
            description: "Compares the benchmark to a baseline from <file>.",
            validate: validatePath,
        },
        midline: {
            type: "string",
            shortName: "m",
            alias: "mid",
            param: "file",
            description: "Compares the benchmark to a midline from <file>.",
            validate: validatePath,
        },
        hosts: {
            type: "string",
            longName: "host",
            alias: "hosts",
            multiple: true,
            defaultValue: () => [],
            param: "host",
            description:
                "Uses the specified <host>. A host has one of the following forms:\n- A known host, restricted by version and processor architecture:\n  <name>[,version=v<version>][,arch=<arch>]\n- A path to an executable:\n  <file>",
        },
        scenarioConfigDirs: {
            type: "string",
            longName: "scenarioConfigDir",
            alias: "scenarioConfigDirs",
            defaultValue: () => [],
            param: "directory",
            multiple: true,
            description: "Paths to directories containing scenario JSON files.",
        },
        scenarios: {
            type: "string",
            longName: "scenario",
            alias: "scenarios",
            multiple: true,
            defaultValue: () => [],
            param: "scenario",
            description: "Run only the named <scenario>.",
        },
        force: {
            type: "boolean",
            shortName: "F",
            description: "If the remote performance service is locked, forcibly overwrite the lock (requires --ssh).",
        },
        repositoryType: {
            type: "string",
            param: "type",
            description: "The type of source control repository for the current version of the product.",
            visibility: "advanced",
        },
        repositoryUrl: {
            type: "string",
            param: "url",
            description: "The url of the source control repository for the current version of the product.",
            visibility: "advanced",
        },
        repositoryBranch: {
            type: "string",
            param: "branch",
            description:
                "The name of the branch in the source control repository for the current version of the product.",
            visibility: "advanced",
        },
        repositoryCommit: {
            type: "string",
            param: "commit",
            description: "The commit name in the source control repository for the current version of the product.",
            visibility: "advanced",
        },
        repositoryCommitSubject: {
            type: "string",
            param: "message",
            description: "The commit subject in the source control repository for the current version of the product.",
            visibility: "advanced",
        },
        repositoryDate: {
            type: "string",
            param: "date",
            description: "The commit date in the source control repository for the current version of the product.",
            visibility: "advanced",
        },
        errorOutOfRange: {
            type: "boolean",
            visibility: "advanced",
            description:
                "Exit with a negative error code if the benchmark is out of the acceptable range from the baseline.",
            defaultValue: false,
        },
        errorRange: {
            type: "number",
            param: "range",
            visibility: "advanced",
            description: "The % maximum acceptable deviation from the baseline from 0 to 100 (default: 5).",
            defaultValue: 5,
        },
        cpus: {
            type: "string",
            visibility: "advanced",
            description: "CPUs to run benchmarked processes on; see the --cpu-list in 'man taskset'",
        },
        predictable: {
            type: "boolean",
            visibility: "advanced",
            description: "Run node with --predictable",
        },
    },
    optionSets: {
        reporting: {
            options: {
                benchmarkName: {
                    type: "string",
                    param: "name",
                    description: "The <name> of the benchmark in the report.",
                },
                baselineName: {
                    type: "string",
                    param: "name",
                    description: "The <name> of the baseline in the report.",
                },
                midlineName: {
                    type: "string",
                    param: "name",
                    description: "The <name> of the midline in the report.",
                },
                relativeDeltaBad: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The relative delta % above which should be reported as 'bad' in the report. Only used in 'html' and 'html-fragment' reports.",
                    defaultValue: 4,
                },
                relativeDeltaNeutral: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The relative delta % above which should be reported as 'neutral' in the report. Only used in 'html' reports.",
                    defaultValue: 2,
                },
                relativeDeltaGood: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The relative delta % below which should be reported as 'good' in the report. Only used in 'html' and 'html-fragment' reports.",
                    defaultValue: -3,
                },
                relativeDeltaGreat: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The relative delta % below which should be reported as 'great' in the report. Only used in 'html' and 'html-fragment' reports.",
                    defaultValue: -30,
                },
                marginOfErrorBad: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The % margin of error which should be reported as 'bad' in the report. Only used in 'html' reports.",
                    defaultValue: 10,
                },
                marginOfErrorNeutral: {
                    type: "number",
                    param: "range",
                    visibility: "advanced",
                    description:
                        "The % margin of error which should be reported as 'bad' in the report. Only used in 'html' reports.",
                    defaultValue: 5,
                },
            },
        },
    },
    example: [
        "# Generate a baseline\nts-perf benchmark tsc --iterations 20 --save master.benchmark",
        "# Run a benchmark and compare to baseline\nts-perf benchmark tsserver --iterations 20 --baseline master.benchmark",
        "# Provide custom compiler options\nts-perf benchmark tsc --iterations 5 -- -noImplicitAny -removeComments",
    ],
    lock: true,
    update: true,
    container: true,
    commands: {},
};

tsc.registerCommands(command.commands);
tsserver.registerCommands(command.commands);
startup.registerCommands(command.commands);

export function registerCommands(commands: CommandMap) {
    commands.benchmark = command;
}
