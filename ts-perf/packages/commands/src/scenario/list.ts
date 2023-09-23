import * as os from "node:os";

import { Command, CommandMap, Scenario } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import { Table } from "table-style";

export interface ListScenarioOptions {
    scenarioConfigDir?: string[];
    color?: boolean;
}

export async function listScenarios(options: ListScenarioOptions, context: HostContext) {
    const scenarios = await Scenario.getAvailableScenarios(options.scenarioConfigDir);
    context.log(
        os.EOL + "Scenarios:" + os.EOL + new Table<Scenario>({
            useColor: options.color,
            columns: [
                {
                    header: "Scenario",
                    expression: x =>
                        `${x.name}${x.isOverriding ? " (OVERRIDING)" : x.isLocal ? " (local)" : ""}${
                            x.disabled ? " (disabled)" : x.default ? " (default)" : ""
                        }`,
                },
                { header: "Kind", expression: x => x.kind },
                { header: "Arguments", expression: x => x.args ? x.args.join(" ") : "" },
                { header: "Platform", expression: x => x.platforms ? x.platforms.join(", ") : "" },
            ],
            rowStyles: [
                "*",
                { match: (x: Scenario) => !!x.disabled, foregroundColor: "dark-gray" },
                {
                    match: (x: Scenario) =>
                        !!x.platforms && !!x.platforms.length && x.platforms.indexOf(os.platform()) === -1,
                    foregroundColor: "dark-gray",
                },
            ],
        }).render(scenarios),
    );
}

const command: Command<ListScenarioOptions> = {
    commandName: "list",
    summary: "List scenarios.",
    description: "List Scenarios.",
    alias: ["ls"],
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
        color: {
            type: "boolean",
            defaultValue: true,
            description: "Determines whether to print results in color.",
        },
    },
    exec: ({ options }, host) => listScenarios(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.list = command;
}
