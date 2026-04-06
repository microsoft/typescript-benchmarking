import { Command, CommandMap } from "@ts-perf/api";

import { benchmark } from ".";

const command: Command = {
    commandName: "lsp",
    summary: "Benchmark LSP scenarios.",
    description: "Benchmark LSP scenarios.",
    include: ["lsp"],
    lock: true,
    update: true,
    exec: ({ options }, host) => benchmark({ kind: "lsp", options }, host),
};

export function registerCommands(commands: CommandMap) {
    commands.lsp = command;
}
