import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Command, CommandMap } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

import { createProfileAnalyzer } from "./model/profiler";
import { AggregateAnalyzer, Analyzer } from "./model/types";

export interface AnalyzeOptions {
    color: boolean;
    files: string[];
    limit: number;
    native: boolean;
    input?: string;
    query?: string;
    replHistoryPath: string;
}

export async function analyze(options: AnalyzeOptions, host: HostContext) {
    const analyzers: Analyzer[] = await Promise.all(
        options.files.map(file => createAnalyzer(file, options.native, host)),
    );
    const analyzer = pickAnalyzer(analyzers);
    const query = options.input ? await fs.promises.readFile(options.input, "utf8") : options.query;
    if (query === undefined) {
        await analyzer.startRepl(options.limit, options.color, options.replHistoryPath);
    }
    else {
        analyzer.analyze(query, options.limit, options.color);
    }
}

function pickAnalyzer(analyzers: Analyzer[]) {
    switch (analyzers.length) {
        case 1:
            return analyzers[0];
        case 2:
            return new AggregateAnalyzer(analyzers);
        default:
            throw new Error("Too many files provided");
    }
}

async function createAnalyzer(file: string, native: boolean, host: HostContext) {
    switch (path.extname(file)) {
        case ".cpuprofile":
            return await createProfileAnalyzer(file, native, host);
        default:
            throw new Error("Unsupported file type.");
    }
}

const command: Command<AnalyzeOptions> = {
    commandName: "analyze",
    options: {
        files: {
            type: "string",
            param: "file",
            longName: "file",
            description: "The .cpuprofile file(s) to analyze.",
            required: true,
            multiple: true,
            rest: true,
            position: 0,
        },
        query: {
            type: "string",
            param: "query",
            shortName: "q",
            description: "An 'iterable-query-linq' query to execute",
            group: "query",
        },
        input: {
            type: "string",
            param: "file",
            shortName: "i",
            description: "A .jsql file containing an 'iterable-query-linq' query",
            group: "input",
        },
        limit: {
            type: "number",
            param: "count",
            description: "The maximum number of results to show.",
            defaultValue: 50,
        },
        color: {
            type: "boolean",
            description: "Determines whether to print results in color.",
            defaultValue: true,
        },
        native: {
            type: "boolean",
            description: "Whether to show native code",
            visibility: "advanced",
            defaultValue: false,
        },
    },
    env: {
        replHistoryPath: {
            type: "string",
            variableName: "TSPERF_REPL_HISTORY",
            description: "The path to the '.tsperf_repl_history' file.",
            defaultValue: () => path.join(os.homedir(), ".tsperf_repl_history"),
        },
    },
    exec: ({ options }, host) => analyze(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.analyze = command;
}
