import { Command, CommandMap } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

import { listLocalHosts } from "../host/list";
import { listScenarios } from "../scenario";

export interface ListOptions {
    color: boolean;
}

export async function list(options: ListOptions, host: HostContext) {
    listScenarios(options, host);
    listLocalHosts(options, host);
}

const command: Command<ListOptions> = {
    commandName: "list",
    summary: "Lists available scenarios and hosts.",
    description: "Lists available scenarios and hosts.",
    options: {
        color: {
            type: "boolean",
            defaultValue: true,
            description: "Determines whether to print results in color.",
        },
    },
    exec: ({ options }, host) => list(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.list = command;
}
