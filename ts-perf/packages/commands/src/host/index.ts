import { Command, CommandMap } from "@ts-perf/api";

import * as configureHost from "./configure";
import * as installHost from "./install";
import * as listHosts from "./list";
import * as uninstallHost from "./uninstall";

export { configureHost, ConfigureHostOptions } from "./configure";
export { installHost, InstallHostOptions } from "./install";
export { listHosts, ListHostsOptions } from "./list";
export { uninstallHost, UninstallHostOptions } from "./uninstall";

export function registerCommands(commands: CommandMap) {
    commands.host = command;
}

const command: Command = {
    commandName: "host",
    summary: "Manage test hosts.",
    description: "Review, add, modify, and remove test hosts.",
    alias: ["hosts"],
    container: true,
    commands: {},
};

installHost.registerCommands(command.commands!);
uninstallHost.registerCommands(command.commands!);
configureHost.registerCommands(command.commands!);
listHosts.registerCommands(command.commands!);
