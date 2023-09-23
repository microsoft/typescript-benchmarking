import * as fs from "node:fs";
import * as path from "node:path";

import { Command, CommandMap, Scenario } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface AddScenarioOptions {
    scenarioConfigDir?: string[];
    name: string;
    args?: string[];
    platforms?: string[];
    default?: boolean;
    disabled?: boolean;
}

export async function addScenario(options: AddScenarioOptions, context: HostContext) {
    const scenarioConfigDirs = Scenario.getScenarioConfigDirs(options.scenarioConfigDir);
    const scenarioConfigDir = scenarioConfigDirs[0];
    if (scenarioConfigDirs.length > 1) {
        context.warn(`Multiple scenario config directories found. Using '${scenarioConfigDir}'.`);
    }

    const configDir = path.resolve(scenarioConfigDir, path.basename(options.name));
    if (!fs.existsSync(configDir)) {
        await fs.promises.mkdir(configDir, { recursive: true });
    }

    const configFile = path.resolve(configDir, "scenario.json");
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
        scenarioConfigDirs: {
            type: "string",
            longName: "scenarioConfigDir",
            alias: "scenarioConfigDirs",
            defaultValue: () => [],
            param: "directory",
            multiple: true,
            description: "Paths to directories containing scenario JSON files.",
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
