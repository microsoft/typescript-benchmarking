import { Command, CommandMap, Host } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface ConfigureHostOptions {
    hosts: string[];
    key: string;
    value: string;
}

export async function configureHost(options: ConfigureHostOptions, host: HostContext) {
    const logger = host.logger;
    const { key, value = "" } = options;
    if (key) {
        let found = false;
        for (const host of await Host.findHosts(options.hosts, { installed: true })) {
            found = true;
            const updated = host.withPairs([[key, value]]);
            if (updated !== host) {
                await updated.saveAsync(host.configFile!);
            }
        }
        if (!found) {
            logger.warn(`A host matching '${options.hosts}' was not found.`);
        }
    }
}

const command: Command<ConfigureHostOptions> = {
    commandName: "configure",
    alias: ["config"],
    summary: "Changes configuration options for hosts.",
    description: "Changes configuration options for hosts.",
    options: {
        hosts: {
            type: "string",
            longName: "host",
            multiple: true,
            required: true,
            position: 0,
            defaultValue: () => [],
            param: "host",
            description:
                "Configures the specified <host> (can be supplied multiple times). A host has the following form:\n  <name>[,version=v<version>][,arch=<arch>]",
        },
        key: {
            type: "string",
            param: "key",
            position: 1,
            required: true,
            description: "The configuration key.",
        },
        value: {
            type: "string",
            param: "value",
            position: 2,
            required: true,
            description: "The configuration value.",
        },
    },
    exec: ({ options }, host) => configureHost(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.configure = command;
}
