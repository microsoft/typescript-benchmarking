import * as fs from "node:fs";
import * as path from "node:path";

import { Command, CommandMap, Host, HostPattern, HostSpecifier } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface UninstallHostOptions {
    hosts: string[];
}

export async function uninstallHost(options: UninstallHostOptions, host: HostContext) {
    const hostPatterns = options.hosts
        .map(testHost => HostPattern.parse(testHost))
        .filter(hostPattern =>
            hostPattern.name === "node" || hostPattern.name === "bun" || hostPattern.name === "vscode"
            || host.error(`Unsupported host specification '${hostPattern.name}'.`)
        );
    const hosts = await Host.findHosts(hostPatterns, { installed: true });
    await Promise.all(hosts.map(testHost => uninstall(testHost, host)));
}

async function uninstall(testHost: Host, host: HostContext) {
    const dirname = path.dirname(testHost.configFile!);
    try {
        await fs.promises.rm(dirname, { recursive: true });
        host.log(`Uninstalled '${HostSpecifier.create(testHost)}'.`);
    }
    catch (e) {
        host.error(`Failed to uninstall '${HostSpecifier.create(testHost)}': ${e}`);
    }
}

const command: Command<UninstallHostOptions> = {
    commandName: "uninstall",
    alias: ["u", "delete"],
    summary: "Uninstall a test host.",
    description: "Uninstalls the specified test host.",
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
                "Uninstalls the specified <host> (can be supplied multiple times). A host has the following form:\n  <name>[,version=v<version>][,arch=<arch>]",
        },
        force: {
            type: "boolean",
            shortName: "F",
            description: "If the remote performance service is locked, forcibly overwrite the lock (requires --ssh).",
        },
    },
    lock: true,
    exec: ({ options }, host) => uninstallHost(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.uninstall = command;
}
