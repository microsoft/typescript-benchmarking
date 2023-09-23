import { CommandLine } from "power-options";

import { HeapOptions } from "./commands/heapProfiler";
import { ProfilerOptions } from "./commands/profiler";

export function parseCommandLine(args: string[]) {
    return commandLine.parse<ProfilerOptions | HeapOptions>(args);
}

export function printHelp(commandName?: string) {
    return commandLine.printHelp(commandName);
}

const commandLine = new CommandLine({
    name: "ts-profiler",
    auto: true,
    color: true,
    commands: {
        profile: {
            options: {
                out: { type: "string", alias: "cpuprofile", position: 0, required: true },
                sourceMap: { type: "boolean" },
                sourceRoot: { type: "string" },
                timeline: { type: "boolean", defaultValue: true },
                trim: { type: "boolean" },
                pretty: { type: "boolean", hidden: true },
            },
        },
        heap: {
            options: {
                out: { type: "string", alias: "heapsnapshot", position: 0, required: true },
                events: { type: "string", longName: "event", multiple: true },
            },
        },
    },
    options: {
        args: {
            type: "string",
            passthru: true,
        },
    },
});
