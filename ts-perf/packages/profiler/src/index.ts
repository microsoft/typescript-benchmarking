import "source-map-support/register";

import { parseCommandLine, printHelp } from "./commandLine";
import { HeapOptions } from "./commands/heapProfiler";
import { ProfilerOptions } from "./commands/profiler";

async function main(args: string[]) {
    const { commandName, options, help } = parseCommandLine(args);
    if (help) return printHelp(commandName);
    switch (commandName) {
        case "profile":
            const profiler = require("./commands/profiler");
            await profiler.profile(options as ProfilerOptions);
            break;
        case "heap":
            const heapProfiler = require("./commands/heapProfiler");
            await heapProfiler.heapProfile(options as HeapOptions);
            break;
        default:
            printHelp();
            break;
    }
}

main(process.argv.slice(2)).catch(console.error);
