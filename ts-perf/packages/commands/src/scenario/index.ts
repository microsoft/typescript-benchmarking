import { Command, CommandMap } from "@ts-perf/api";

import * as addScenario from "./add";
import * as configureScenario from "./configure";
import * as deleteScenario from "./delete";
import * as listScenario from "./list";
import * as localScenario from "./local";

export { addScenario, AddScenarioOptions } from "./add";
export { configureScenario, ConfigureScenarioOptions } from "./configure";
export { deleteScenario, DeleteScenarioOptions } from "./delete";
export { ListScenarioOptions, listScenarios } from "./list";

export function registerCommands(commands: CommandMap) {
    commands.scenario = command;
}

const commands: CommandMap = {};
addScenario.registerCommands(commands);
configureScenario.registerCommands(commands);
deleteScenario.registerCommands(commands);
listScenario.registerCommands(commands);
localScenario.registerCommands(commands);
const command: Command = {
    commandName: "scenario",
    summary: "Manage performance scenarios.",
    description: "Review, add, modify, and remove performance scenarios.",
    alias: ["scenarios"],
    container: true,
    commands,
};
