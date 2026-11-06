import { Benchmark, Command, CommandMap } from "@ts-perf/api";
import { CommandLineParseError } from "power-options";

export interface MergeOptions {
    files: string[];
    output: string;
    iterations?: number;
    normalize?: boolean;
    normalizeWith?: string[];
}

export async function merge(options: MergeOptions) {
    let benchmarks;
    try {
        benchmarks = await Promise.all(options.files.map(file => Benchmark.loadAsync(file)));
    }
    catch (e) {
        throw new Error(`Failed to load benchmark files`, { cause: e });
    }

    if (benchmarks.length < 1) {
        throw new Error(`Expected at least one benchmark file`);
    }

    if (options.normalizeWith && !options.normalize) {
        throw new Error(`Option '--normalizeWith' requires '--normalize'`);
    }

    if (options.normalize) {
        let partners;
        if (options.normalizeWith) {
            try {
                partners = await Promise.all(options.normalizeWith.map(file => Benchmark.loadAsync(file)));
            }
            catch (e) {
                throw new Error(`Failed to load benchmark files`, { cause: e });
            }
        }
        benchmarks = Benchmark.normalizeTimes(benchmarks, partners);
    }

    try {
        let result = benchmarks[0];
        for (let i = 1; i < benchmarks.length; i++) {
            result = result.merge(benchmarks[i]);
        }
        if (options.iterations !== undefined) {
            result = result.with({ iterations: options.iterations });
        }
        await result.saveAsync(options.output);
    }
    catch (e) {
        throw new Error(`Failed to merge benchmark files`, { cause: e });
    }
}

const command: Command<MergeOptions> = {
    commandName: "merge",
    summary: "Merge benchmark files.",
    description: "Merge benchmark files.",
    options: {
        files: {
            type: "string",
            multiple: true,
            required: true,
            rest: true,
            description: "Benchmark files to be merged.",
        },
        output: {
            type: "string",
            required: true,
            description: "Where to store the merged benchmark file.",
        },
        iterations: {
            type: "number",
            param: "count",
            description: "Records <count> iterations in the merged file, such as when merging rounds of one benchmark.",
            validate: (value: number, arg: string) => {
                if (!Number.isInteger(value) || value <= 0) {
                    throw new CommandLineParseError(`Option '${arg}' expects a positive integer.`, /*help*/ true);
                }
            },
        },
        normalize: {
            type: "boolean",
            description:
                "Rescales time samples so each file has the same mean for measurements found in several files, such as when merging results from different machines.",
        },
        normalizeWith: {
            type: "string",
            multiple: true,
            param: "file",
            description:
                "With '--normalize', the files measured on the same machines as the merged files, in the same order, such as the other side of an interleaved comparison. Each machine's speed is taken from both, so both sides get the same scale.",
        },
    },
    exec: ({ options }) => merge(options),
};

export function registerCommands(commands: CommandMap) {
    commands.merge = command;
}
