import { Command, CommandMap } from "@ts-perf/api";

import { benchmark } from ".";

const command: Command = {
    commandName: "tsc",
    summary: "Benchmark tsc scenarios.",
    description: "Benchmark tsc scenarios.",
    include: ["compiler"],
    lock: true,
    update: true,
    exec: ({ options }, host) => benchmark({ kind: "tsc", options }, host),
};

export function registerCommands(commands: CommandMap) {
    commands.tsc = command;
}
