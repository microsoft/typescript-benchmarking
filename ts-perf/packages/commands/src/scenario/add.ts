import * as fs from "node:fs";
import * as path from "node:path";

import { Command, CommandMap, Scenario } from "@ts-perf/api";
import { HostContext, localScenariosDirectory } from "@ts-perf/core";

export interface AddScenarioOptions {
    scenarioDir?: string;
    name: string;
    args?: string[];
    platforms?: string[];
    default?: boolean;
    disabled?: boolean;
}

export async function addScenario(options: AddScenarioOptions, context: HostContext) {
    const scenariosDir = options.scenarioDir ? path.resolve(options.scenarioDir) : localScenariosDirectory;
    const scenarioDir = path.resolve(scenariosDir, path.basename(options.name));
    if (!fs.existsSync(scenarioDir)) {
        await fs.promises.mkdir(scenarioDir, { recursive: true });
    }

    const configFile = path.resolve(scenarioDir, "scenario.json");
    const scenario = Scenario.create({ ...options, kind: "tsc", configFile });
    await scenario.saveAsync(configFile);

    context.info(`Scenario '${scenario.name}' added locally`);
}

const command: Command<AddScenarioOptions> = {
    commandName: "add",
    summary: "Add a local compiler scenario.",
    description: "Add a local compiler scenario.",
    options: {
        name: {
            type: "string",
            longName: "scenario",
            alias: ["name"],
            required: true,
            position: 0,
            defaultValue: () => [],
            param: "name",
            description: "",
        },
        scenarioDir: {
            type: "string",
            alias: "scenarioConfigDir",
            param: "directory",
            description:
                "Use <directory> as a location containing individual test scenario folders each with a 'scenario.json'. If not set, uses '~/.tsperf/scenarios', if present.",
        },
        args: {
            type: "string",
            multiple: "comma-separated",
        },
        platforms: {
            type: "string",
            multiple: "comma-separated",
            in: ["win32", "linux"],
        },
        default: {
            type: "boolean",
        },
        disabled: {
            type: "boolean",
        },
    },
    exec: ({ options }, host) => addScenario(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.add = command;
}
