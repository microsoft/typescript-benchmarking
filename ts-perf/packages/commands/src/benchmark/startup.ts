import { Command, CommandMap } from "@ts-perf/api";

import { benchmark } from ".";

const command: Command = {
    commandName: "startup",
    summary: "Benchmark startup scenarios.",
    description: "Benchmark startup scenarios.",
    include: ["startup"],
    lock: true,
    update: true,
    exec: ({ options }, host) => benchmark({ kind: "startup", options }, host),
};

export function registerCommands(commands: CommandMap) {
    commands.startup = command;
}
