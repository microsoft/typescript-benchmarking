import { execFileSync } from "node:child_process";
import * as cp from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
    TSServerCommand,
    TSServerCompletionInfoCommand,
    TSServerConfig,
    TSServerGeterrCommand,
    TSServerNavtoCommand,
    TSServerReferencesCommand,
    TSServerUpdateOpenCommand,
} from "@ts-perf/api";
import { CommandLine, CommandLineParseError } from "power-options";
import * as rpc from "vscode-jsonrpc/node";
import * as protocol from "vscode-languageserver-protocol";

main().catch(e => {
    console.error(e);
    process.exit(2);
});

interface CLIOpts {
    lsp: string;
    commands: string;
    suite: string;
    extended?: boolean;
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
            lsp: {
                shortName: "l",
                type: "string",
                required: true,
                description: "Path to the LSP server executable (e.g. './built/local/tsgo')",
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

function filePathToUri(filePath: string): string {
    return pathToFileURL(filePath).toString();
}

function getLanguageId(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case ".ts":
        case ".mts":
        case ".cts":
            return "typescript";
        case ".js":
        case ".mjs":
        case ".cjs":
            return "javascript";
        case ".tsx":
            return "typescriptreact";
        case ".jsx":
            return "javascriptreact";
        default:
            return "typescript";
    }
}

async function runPerf(options: CLIOpts) {
    const config: TSServerConfig =
        JSON.parse(await fs.promises.readFile(options.commands, { encoding: "utf-8" })).tsserverConfig;
    const solution = path.resolve(path.join(options.suite, config.solution));
    const lspServerPath = path.resolve(options.lsp);
    // Needed for excludedDirectories
    process.chdir(solution);

    const serverArgs: string[] = ["--lsp", "--stdio"];

    const serverProc = cp.spawn(lspServerPath, serverArgs, {
        stdio: ["pipe", "pipe", "ignore"],
    });

    const connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(serverProc.stdout!),
        new rpc.StreamMessageWriter(serverProc.stdin!),
    );

    // Handle any server-to-client requests (e.g. client/registerCapability)
    connection.onRequest((_method, _params) => {
        return null;
    });

    connection.listen();

    serverProc.on("exit", code => console.log(code ? `Exited with code ${code}` : `Terminated`));

    // seq tracks request numbering; starts at 1 for initialize (analogous to configure in tsserver)
    let seq = 1;

    try {
        // Initialize the LSP server (analogous to the configure message in tsserver)
        const solutionUri = filePathToUri(solution);
        await connection.sendRequest(protocol.InitializeRequest.method, {
            processId: process.pid,
            capabilities: {
                textDocument: {
                    completion: {
                        completionItem: {
                            snippetSupport: true,
                            insertReplaceSupport: true,
                            resolveSupport: {
                                properties: ["documentation", "detail", "additionalTextEdits"],
                            },
                            commitCharactersSupport: true,
                            deprecatedSupport: true,
                            preselectSupport: true,
                            labelDetailsSupport: true,
                        },
                        contextSupport: true,
                    },
                    definition: { linkSupport: true },
                    references: {},
                    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
                    foldingRange: {},
                    hover: {},
                    diagnostic: { relatedDocumentSupport: true },
                    implementation: { linkSupport: true },
                    typeDefinition: { linkSupport: true },
                },
                workspace: {
                    symbol: {},
                },
            },
            rootUri: solutionUri,
        } as protocol.InitializeParams);

        await connection.sendNotification(protocol.InitializedNotification.method, {});

        // Account for initialize so command numbering matches measuretsserver.ts output
        seq++;

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
                await runCommand(command, seq++);
            }
        }
    }
    finally {
        // Shut down the LSP server
        try {
            await connection.sendRequest(protocol.ShutdownRequest.method);
            await connection.sendNotification(protocol.ExitNotification.method);
        }
        catch {
            // Server may have already exited
        }
        connection.dispose();
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

    async function updateOpen(command: TSServerUpdateOpenCommand, _seq: number): Promise<number> {
        // Read file contents before timing (same as measuretsserver.ts)
        const openFiles = await Promise.all(command.args.map(async fileArg => {
            const file = path.join(solution, fileArg.file);
            return {
                uri: filePathToUri(file),
                content: await fs.promises.readFile(file, { encoding: "utf-8" }),
                languageId: getLanguageId(file),
            };
        }));

        const start = performance.now();
        for (const openFile of openFiles) {
            await connection.sendNotification(protocol.DidOpenTextDocumentNotification.method, {
                textDocument: {
                    uri: openFile.uri,
                    languageId: openFile.languageId,
                    version: 1,
                    text: openFile.content,
                },
            } as protocol.DidOpenTextDocumentParams);
        }
        const end = performance.now();
        return Math.round(end - start);
    }

    async function geterr(command: TSServerGeterrCommand, _seq: number): Promise<number> {
        const files = command.args.map(f => path.join(solution, f));
        const start = performance.now();
        for (const file of files) {
            const fileUri = filePathToUri(file);
            await connection.sendRequest(protocol.DocumentDiagnosticRequest.method, {
                textDocument: { uri: fileUri },
            } as protocol.DocumentDiagnosticParams);
        }
        const end = performance.now();
        return Math.round(end - start);
    }

    async function references(command: TSServerReferencesCommand, _seq: number): Promise<number> {
        const file = path.join(solution, command.args.file);
        const fileUri = filePathToUri(file);
        const start = performance.now();
        await connection.sendRequest(protocol.ReferencesRequest.method, {
            textDocument: { uri: fileUri },
            position: {
                line: command.args.line,
                character: command.args.offset,
            },
            context: { includeDeclaration: true },
        } as protocol.ReferenceParams);
        const end = performance.now();
        return Math.round(end - start);
    }

    async function navto(command: TSServerNavtoCommand, _seq: number): Promise<number> {
        const start = performance.now();
        await connection.sendRequest(protocol.WorkspaceSymbolRequest.method, {
            query: command.args.searchValue,
        } as protocol.WorkspaceSymbolParams);
        const end = performance.now();
        return Math.round(end - start);
    }

    async function completionInfo(command: TSServerCompletionInfoCommand, seq: number): Promise<number> {
        const file = path.join(solution, command.args.file);
        const fileUri = filePathToUri(file);
        const start = performance.now();
        const completions = await connection.sendRequest<protocol.CompletionList | protocol.CompletionItem[] | null>(
            protocol.CompletionRequest.method,
            {
                textDocument: { uri: fileUri },
                position: {
                    line: command.args.line,
                    character: command.args.offset,
                },
            } as protocol.CompletionParams,
        );
        const end = performance.now();
        const count = completions
            ? Array.isArray(completions)
                ? completions.length
                : completions.items?.length ?? -1e6
            : -1e6;
        console.log(`Req ${seq - 1} - ${command.commandName} count: ${count}`);
        return Math.round(end - start);
    }
}
