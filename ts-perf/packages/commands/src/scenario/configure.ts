import { Command, CommandMap, CommonOptions, Scenario } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface ConfigureScenarioOptions extends CommonOptions {
    scenarios: string[];
    args?: string[];
    platforms?: string[];
    default?: boolean;
    disabled?: boolean;
}

export async function configureScenario(options: ConfigureScenarioOptions, context: HostContext) {
    const scenarios = await Scenario.findScenarios(options.scenarioDirs, options.scenarios);
    if (scenarios.length === 0) {
        context.error(`No matching scenarios.`);
        return;
    }

    const updated = scenarios.map(scenario =>
        scenario.with({
            args: options.args,
            platforms: options.platforms,
            default: options.default,
            disabled: options.disabled,
        })
    );

    await Promise.all(updated.map(scenario => scenario.saveAsync(scenario.configFile)));
    context.log(`Scenarios updated`);
}

const command: Command<ConfigureScenarioOptions> = {
    commandName: "configure",
    summary: "Configure a scenario.",
    description: "Configure a scenario.",
    alias: ["config", "common"],
    options: {
        scenarios: {
            type: "string",
            longName: "scenario",
            required: true,
            multiple: true,
            position: 0,
            defaultValue: () => [],
            param: "name",
            description: "",
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
    exec: ({ options }, host) => configureScenario(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.configure = command;
}
