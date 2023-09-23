import { Command, CommandMap } from "@ts-perf/api";

import { benchmark } from ".";

const command: Command = {
    commandName: "tsserver",
    summary: "Benchmark tsserver scenarios.",
    description: "Benchmark tsserver scenarios.",
    include: ["tsserver"],
    lock: true,
    update: true,
    exec: ({ options }, host) => benchmark({ kind: "tsserver", options }, host),
};

export function registerCommands(commands: CommandMap) {
    commands.tsserver = command;
}
