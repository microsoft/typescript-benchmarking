import { Command, CommandMap } from "@ts-perf/api";

import { benchmark } from ".";

const command: Command = {
    commandName: "api",
    summary: "Benchmark external TypeScript 7 API consumers.",
    description: "Benchmark pinned external consumers using the matching native compiler and JS API.",
    include: ["startup"],
    options: {
        apiMemory: {
            type: "boolean",
            description: "Run separate API allocation/memory iterations (requires compiler memory telemetry support).",
        },
    },
    lock: true,
    update: true,
    exec: ({ options }, host) => benchmark({ kind: "api", options }, host),
};

export function registerCommands(commands: CommandMap) {
    commands.api = command;
}
