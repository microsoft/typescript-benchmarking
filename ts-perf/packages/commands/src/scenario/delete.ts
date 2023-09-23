import * as fs from "node:fs";
import * as path from "node:path";

import { Command, CommandMap, CompilerOptions, Scenario } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface DeleteScenarioOptions extends CompilerOptions {
    scenarioConfigDir?: string[];
    scenario: string;
    recursive?: boolean;
}

export async function deleteScenario(options: DeleteScenarioOptions, context: HostContext) {
    const scenarios = await Scenario.findScenarios(options.scenarioConfigDir, [options.scenario], /*kind*/ undefined, {
        includeUnsupported: true,
    });
    if (scenarios.length === 0) {
        context.error(`Scenario '${options.scenario}' not found.`);
        return;
    }
    else if (scenarios.length > 1) {
        context.error(`Multiple scenarios for '${options.scenario}' were found.`);
        return;
    }

    const scenario = scenarios[0];
    if (!scenario.configFile) {
        context.error(`Scenario '${scenario.name}' is built-in and cannot be deleted.`);
        return;
    }

    const configFile = path.resolve(scenario.configFile);
    if (!fs.existsSync(configFile)) {
        context.error(`'${configFile}' not found.`);
        return;
    }

    const configDir = path.dirname(configFile);
    await fs.promises.unlink(scenario.configFile);

    try {
        await fs.promises.rm(configDir, { recursive: options.recursive });
    }
    catch (e) {
        if (options.recursive) {
            throw e;
        }
    }

    context.info(`Scenario '${scenario.name}' deleted.`);
}

const command: Command<DeleteScenarioOptions> = {
    commandName: "delete",
    summary: "Delete a scenario.",
    description: "Delete a scenario.",
    alias: ["rm"],
    options: {
        scenarioConfigDirs: {
            type: "string",
            longName: "scenarioConfigDir",
            alias: "scenarioConfigDirs",
            defaultValue: () => [],
            param: "directory",
            multiple: true,
            description: "Paths to directories containing scenario JSON files.",
        },
        scenario: {
            type: "string",
            longName: "scenario",
            required: true,
            position: 0,
            defaultValue: () => [],
            param: "name",
            description: "",
        },
        recursive: {
            type: "boolean",
        },
    },
    exec: ({ options }, host) => deleteScenario(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.delete = command;
}
