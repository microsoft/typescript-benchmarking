import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";

import {
    TSServerCommand,
    TSServerCompletionInfoCommand,
    TSServerConfig,
    TSServerGeterrCommand,
    TSServerNavtoCommand,
    TSServerReferencesCommand,
    TSServerUpdateOpenCommand,
} from "@ts-perf/api";
import * as serverHarness from "@typescript/server-harness";
import { CommandLine, CommandLineParseError } from "power-options";

main().catch(e => {
    console.error(e);
    process.exit(2);
});

interface CLIOpts {
    tsserver: string;
    commands: string;
    suite: string;
    extended?: boolean;
    cpus?: string;
    predictable?: boolean;
}

async function main() {
    const cli = new CommandLine({
        auto: true,
        options: {
            help: {
                shortName: "h",
                alias: ["?"],
                help: true,
            },
            tsserver: {
                shortName: "t",
                type: "string",
                required: true,
                description: "Path to the tsserver (e.g. './built/local/tsserver.js')",
                validate: validatePath,
            },
            commands: {
                shortName: "c",
                type: "string",
                required: true,
                description: "Path to a json file that configures the tsserver commands",
                validate: validatePath,
            },
            suite: {
                shortName: "s",
                type: "string",
                required: true,
                description: "Path to root location for test suites (e.g. './internal/cases/perf/solutions')",
                validate: validatePath,
            },
            extended: {
                type: "boolean",
                description: "If the scenario declares optional (aka extended) requests, run those as well",
            },
            cpus: {
                type: "string",
                description: "CPUs to run benchmarked processes on; see the --cpu-list in 'man taskset'",
            },
            predictable: {
                type: "boolean",
                description: "Run node with --predictable",
            },
        },
        exec: ({ options }) => runPerf(options),
    });
    await cli.parseAndExecute(process.argv.slice(2), undefined);
}

function validatePath(value: string, arg: string) {
    if (!fs.existsSync(value)) {
        throw new CommandLineParseError(`Option '${arg}' path not found: '${value}'.`);
    }
}

async function runPerf(options: CLIOpts) {
    const config: TSServerConfig =
        JSON.parse(await fs.promises.readFile(options.commands, { encoding: "utf-8" })).tsserverConfig;
    const solution = path.resolve(path.join(options.suite, config.solution));
    const tsserver = path.resolve(options.tsserver);
    // Needed for excludedDirectories
    process.chdir(solution);

    const execArgv = [
        "--max-old-space-size=4096",
    ];
    if (options.predictable) {
        execArgv.push("--predictable");
    }

    let seq = 1;
    const server = serverHarness.launchServer(
        tsserver,
        // Arguments to tsserver.js
        [
            // ATA generates some extra network traffic and isn't usually relevant when profiling
            "--disableAutomaticTypingAcquisition",
        ],
        // Arguments to node
        execArgv,
    );
    try {
        server.on("exit", code => console.log(code ? `Exited with code ${code}` : `Terminated`));

        if (options.cpus) {
            if (!server.pid) {
                throw new Error("--cpus specified, but server did not report PID");
            }
            if (process.platform !== "linux") {
                throw new Error("--cpus only works on Linux");
            }

            // Since the server is run via fork, we can't exec it via taskset directly.
            // Instead, we have to set the CPU affinity after it starts. This should be fine
            // as the stuff we want to measure happens later.
            //
            // Note: this argv ordering is weird; it's intentional that the PID is at the end
            // and not next to the --pid flag.
            execFileSync("taskset", ["--all-tasks", "--cpu-list", "--pid", options.cpus, `${server.pid}`]);
        }

        // Always start with a `configure` message (possibly preceded by `status` if emulating VS)
        await server.message({
            seq: seq++,
            type: "request",
            command: "configure",
            arguments: {
                preferences: {
                    includePackageJsonAutoImports: "on",
                    includeCompletionsForImportStatements: true,
                    allowIncompleteCompletions: true,
                },
                watchOptions: {
                    excludeDirectories: ["**/node_modules"],
                },
            },
        });

        // Check if the canonical (non-extended) commands in the config are correct
        if (config.commands[0].commandName !== "updateOpen") {
            throw new Error(`Expected command 0 to be 'updateOpen', got ${config.commands[0].commandName}`);
        }
        if (config.commands[1].commandName !== "geterr") {
            throw new Error(`Expected command 1 to be 'geterr', got ${config.commands[1].commandName}`);
        }
        if (config.commands[2].commandName !== "references") {
            throw new Error(`Expected command 2 to be 'references', got ${config.commands[2].commandName}`);
        }
        if (config.commands[3].commandName !== "navto") {
            throw new Error(`Expected command 3 to be 'navto', got ${config.commands[3].commandName}`);
        }
        if (config.commands[4].commandName !== "completionInfo") {
            throw new Error(`Expected command 4 to be 'completionInfo', got ${config.commands[4].commandName}`);
        }

        const maxCommands = options.extended ? config.commands.length : 5;
        for (let i = 0; i < maxCommands; i++) {
            const command = config.commands[i];
            if (command) {
                if (options.cpus) {
                    // It appears as sleeping for a little each command prevents high variance
                    // in the time measurement; probably something to do with how we are using
                    // a lot of IPC and Node IO (via libuv) may be positioned on another thread,
                    // which isn't optimal when we are constraining the entire process to a
                    // single core.
                    await sleep(1000);
                }
                await runCommand(command, seq++);
            }
        }
    }
    finally {
        // Tell the server to shut down
        await server.message({ seq: seq++, command: "exit" });
    }

    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function runCommand(command: TSServerCommand, seq: number): Promise<void> {
        let time: number;
        switch (command.commandName) {
            case "updateOpen":
                time = await updateOpen(command, seq);
                break;
            case "geterr":
                time = await geterr(command, seq);
                break;
            case "references":
                time = await references(command, seq);
                break;
            case "navto":
                time = await navto(command, seq);
                break;
            case "completionInfo":
                time = await completionInfo(command, seq);
                break;
            default:
                throw new Error(`Could not recognize command '${(command as any).commandName}'.`);
        }
        console.log(`Req ${seq - 1} - ${command.commandName}: ${time}`);
    }

    async function updateOpen(command: TSServerUpdateOpenCommand, seq: number): Promise<number> {
        const openFiles = await Promise.all(command.args.map(async fileArg => {
            const file = path.join(solution, fileArg.file);
            return {
                file,
                fileContent: await fs.promises.readFile(file, { encoding: "utf-8" }),
                projectRootPath: solution,
            };
        }));
        const start = performance.now();
        await server.message({
            seq,
            type: "request",
            command: "updateOpen",
            arguments: {
                changedFiles: [],
                closedFiles: [],
                openFiles,
            },
        });
        const end = performance.now();
        return Math.round(end - start);
    }

    async function geterr(command: TSServerGeterrCommand, seq: number): Promise<number> {
        const files = command.args.map(f => path.join(solution, f));
        const start = performance.now();
        await server.message({
            seq,
            type: "request",
            command: "geterr",
            arguments: {
                delay: 0,
                files,
            },
        });
        const end = performance.now();
        return Math.round(end - start);
    }

    async function references(command: TSServerReferencesCommand, seq: number): Promise<number> {
        const file = path.join(solution, command.args.file);
        const start = performance.now();
        await server.message({
            seq,
            type: "request",
            command: "references",
            arguments: {
                file,
                line: command.args.line,
                offset: command.args.offset,
            },
        });
        const end = performance.now();
        return Math.round(end - start);
    }

    async function navto(command: TSServerNavtoCommand, seq: number): Promise<number> {
        const start = performance.now();
        await server.message({
            seq,
            type: "request",
            command: "navto",
            arguments: {
                searchValue: command.args.searchValue,
                maxResultCount: 256, // This is the limit used in vscode.
            },
        });
        const end = performance.now();
        return Math.round(end - start);
    }

    async function completionInfo(command: TSServerCompletionInfoCommand, seq: number): Promise<number> {
        const file = path.join(solution, command.args.file);
        const start = performance.now();
        const completions = await server.message({
            seq,
            type: "request",
            command: "completionInfo",
            arguments: {
                file,
                line: command.args.line,
                offset: command.args.offset,
                includeExternalModuleExports: true,
                includeInsertTextCompletions: true,
                triggerKind: 1,
            },
        });
        const end = performance.now();
        console.log(`Req ${seq - 1} - ${command.commandName} count: ${completions?.body?.entries?.length || -1e6}`);
        return Math.round(end - start);
    }
}
