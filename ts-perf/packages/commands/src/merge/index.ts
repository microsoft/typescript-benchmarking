import { Benchmark, Command, CommandMap } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface MergeOptions {
    files: string[];
    output: string;
}

export async function merge(options: MergeOptions, host: HostContext) {
    let benchmarks;
    try {
        benchmarks = await Promise.all(options.files.map(file => Benchmark.loadAsync(file)));
    }
    catch (e) {
        host.error(`Failed to load benchmark files: ${e}`);
        return;
    }

    if (benchmarks.length < 1) {
        host.error(`Expected at least one benchmark file`);
        return;
    }

    try {
        let result = benchmarks[0];
        for (let i = 1; i < benchmarks.length; i++) {
            result = result.merge(benchmarks[i]);
        }
        await result.saveAsync(options.output);
    }
    catch (e) {
        host.error(`Failed to merge benchmark files: ${e}`);
        return;
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
    exec: ({ options }, host) => merge(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.merge = command;
}
