import "source-map-support/register";

import { CompilerOptions, discoverCommands, optionSets } from "@ts-perf/api";
import { HostContext, Logger, LogLevel, ProcessExitError } from "@ts-perf/core";
import { CommandLine, ParsedCommandLine } from "power-options";

const logger = new Logger(LogLevel.Info, { out: process.stdout, err: process.stderr });
const host = new HostContext(logger);
const commandLine = new CommandLine({
    package: true,
    color: true,
    auto: true,
    container: true,
    commands: discoverCommands(),
    optionSets,
    options: {
        // CLI options
        quiet: {
            type: "boolean",
            shortName: "q",
            description: "Only prints minimal output information.",
            aliasFor: ["--log-level", "quiet"],
        },
        verbose: {
            type: "boolean",
            shortName: "v",
            description: "Prints detailed diagnostic information.",
            aliasFor: ["--log-level", "verbose"],
        },
        logLevel: {
            longName: "log-level",
            description: "Sets the diagnostics level, either 'quiet', 'info' (default), or 'verbose'.",
            param: "level",
            type: "number",
            alias: "level",
            visibility: "advanced",
            map: {
                off: LogLevel.Off,
                error: LogLevel.Error,
                warning: LogLevel.Warning,
                info: LogLevel.Info,
                verbose: LogLevel.Verbose,

                none: LogLevel.Off,
                quiet: LogLevel.Error,
                warn: LogLevel.Warning,

                [LogLevel.Off]: LogLevel.Off,
                [LogLevel.Error]: LogLevel.Error,
                [LogLevel.Warning]: LogLevel.Warning,
                [LogLevel.Info]: LogLevel.Info,
                [LogLevel.Verbose]: LogLevel.Verbose,
            },
            defaultValue: LogLevel.Info,
        },
    },
    preExec: async (parsed: ParsedCommandLine<CompilerOptions & { logLevel: LogLevel; }>, host: HostContext) => {
        const options = parsed.options;

        // update the log level
        host.logger.level = options.logLevel;

        if (parsed.help || parsed.error || !parsed.command || !parsed.commandPath) return;
    },
});

async function main(args: string[]) {
    try {
        const result = await commandLine.parseAndExecute(args, host);
        if (!result.handled) {
            throw new Error(`Command '${result.commandPath && result.commandPath.join(" ")}' was unhandled.`);
        }
    }
    catch (e) {
        if (e instanceof ProcessExitError) {
            process.exit(e.exitCode);
        }
        else {
            throw e;
        }
    }
}

main(process.argv.slice(2)).then(
    () => {
        process.exit(0);
    },
    e => {
        console.error(e);
        process.exit(1);
    },
);
