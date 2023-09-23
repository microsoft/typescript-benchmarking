import * as fs from "node:fs";

import { Command, CommandMap } from "@ts-perf/api";
import { HostContext, localScenariosDirectory } from "@ts-perf/core";

export async function localScenario(_options: unknown, context: HostContext) {
    if (!fs.existsSync(localScenariosDirectory)) {
        await fs.promises.mkdir(localScenariosDirectory, { recursive: true });
    }
    context.info(`Local scenarios directory created at '${localScenariosDirectory}'.`);
}

const command: Command<unknown> = {
    commandName: "local",
    summary: "Set up a local scenarios directory.",
    description: "Set up a local scenarios directory.",
    options: {},
    exec: ({ options }, host) => localScenario(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.local = command;
}
