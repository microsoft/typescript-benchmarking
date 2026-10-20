import { Benchmark, Command, CommandMap } from "@ts-perf/api";

export interface MergeOptions {
    files: string[];
    output: string;
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

    try {
        let result = benchmarks[0];
        for (let i = 1; i < benchmarks.length; i++) {
            result = result.merge(benchmarks[i]);
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
    },
    exec: ({ options }) => merge(options),
};

export function registerCommands(commands: CommandMap) {
    commands.merge = command;
}
