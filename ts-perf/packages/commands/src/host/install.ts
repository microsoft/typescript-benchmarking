import { Command, CommandMap } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

import { installMatchingBunHosts } from "./bunInstaller";
import { installMatchingNodeHosts } from "./nodeInstaller";
import { installMatchingVSCodeHosts } from "./vscodeInstaller";

export interface InstallHostOptions {
    hosts: string[];
    sets: string[];
    force?: boolean;
}

export async function installHost(options: InstallHostOptions, context: HostContext) {
    let unmatchedHosts = await installMatchingNodeHosts(options, context);
    unmatchedHosts = await installMatchingBunHosts({ ...options, hosts: unmatchedHosts }, context);
    unmatchedHosts = await installMatchingVSCodeHosts({ ...options, hosts: unmatchedHosts }, context);
    if (unmatchedHosts.length !== 0) {
        context.error(`Could not install ${unmatchedHosts.join(", ")}}`);
    }
}

const command: Command<InstallHostOptions> = {
    commandName: "install",
    alias: ["i", "add"],
    summary: "Install a test host.",
    description: "Installs the specified test host.",
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
                "Installs the specified <host> (can be supplied multiple times). A host should have the form:\n  node@<version number>",
        },
        sets: {
            type: "string",
            longName: "config",
            multiple: true,
            defaultValue: () => [],
            param: "entry",
            description:
                "Sets the value for the specified key/value pair (can be supplied multiple times). An <entry> has the form: <key>=<value>",
        },
        force: {
            type: "boolean",
            shortName: "F",
            description: "If the remote performance service is locked, forcibly overwrite the lock (requires --ssh).",
        },
    },
    lock: true,
    exec: ({ options }, host) => installHost(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.install = command;
}
