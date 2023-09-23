import * as os from "node:os";

import { Command, CommandMap, Host } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import { Table } from "table-style";

import { listInstallableBunHosts } from "./bunInstaller";
import { listInstallableNodeHosts } from "./nodeInstaller";
import { listInstallableVSCodeHosts } from "./vscodeInstaller";

export interface ListHostsOptions {
    color: boolean;
    installable: boolean;
    host?: string;
    limit?: number;
}

export async function listHosts(options: ListHostsOptions, host: HostContext) {
    if (options.installable) {
        await listInstallableNodeHosts(options, host);
        await listInstallableBunHosts(options, host);
        await listInstallableVSCodeHosts(options, host);
    }
    else {
        await listLocalHosts(options, host);
    }
}

export async function listLocalHosts(options: Pick<ListHostsOptions, "color">, host: HostContext) {
    const hosts = await Host.getAvailableHosts();
    host.log(
        "Hosts:" + os.EOL + new Table<Host>({
            useColor: options.color,
            columns: [
                {
                    header: "Host",
                    expression: x => `${x.name}${x.disabled ? " (disabled)" : x.default ? " (default)" : ""}`,
                },
                { header: "Version", expression: x => x.version || "" },
                { header: "Arch", expression: x => x.arch || "" },
                { header: "Platform", expression: x => x.platform || "" },
                { header: "Path", expression: x => x.executableFile },
                { header: "Arguments", expression: x => x.args ? x.args.join(" ") : "" },
            ],
            rowStyles: [
                "*",
                { match: (x: Host) => !!x.disabled || !x.default, foregroundColor: "dark-gray" },
                { match: (x: Host) => !!x.platform && x.platform !== os.platform(), foregroundColor: "dark-gray" },
            ],
        }).render(hosts),
    );
}

const command: Command<ListHostsOptions> = {
    commandName: "list",
    summary: "Lists test hosts.",
    description: "Lists test hosts.",
    options: {
        color: {
            type: "boolean",
            defaultValue: true,
            description: "Determines whether to print results in color.",
        },
        installable: {
            type: "boolean",
            longName: "available",
            defaultValue: false,
            description: "Lists hosts that can be installed",
            group: "installable",
        },
        host: {
            type: "string",
            longName: "host",
            param: "host",
            description:
                "Lists installable hosts matching the specified <host> (can be supplied multiple times). A host has the following form:\n  node[,version=v<version>][,arch=<arch>]",
            group: "installable",
        },
        limit: {
            type: "number",
            description: "Limits the number of results returned per version",
            group: "installable",
            defaultValue: 3,
        },
    },
    exec: ({ options }, host) => listHosts(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.list = command;
}
