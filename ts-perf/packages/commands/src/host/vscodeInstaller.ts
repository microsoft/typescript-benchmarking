import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Host, HostPattern } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import { download } from "@vscode/test-electron";
import * as semver from "semver";

import { InstallHostOptions } from "./install";
import { ListHostsOptions } from "./list";

const osPlatform = os.platform();
const osArch = os.arch() === "ia32" ? "x86" : os.arch();

export async function listInstallableVSCodeHosts(options: ListHostsOptions, host: HostContext) {
    // TODO
}

export async function installMatchingVSCodeHosts(options: InstallHostOptions, context: HostContext): Promise<string[]> {
    if (osPlatform !== "linux" || osArch !== "x64") {
        context.error(`VS Code hosts can only be installed on linux-x64.`);
        return options.hosts;
    }

    const unmatchedHosts: string[] = [];
    const versions: string[] = [];

    for (const testHost of options.hosts) {
        const hostPattern = HostPattern.parse(testHost);
        if (!hostPattern.partialMatch({ name: "vscode" })) {
            unmatchedHosts.push(testHost);
            continue;
        }
        const version = semver.valid(hostPattern.version || "", false);
        if (version) {
            versions.push();
        }
    }

    if (versions.length === 0) {
        return unmatchedHosts;
    }

    for (const version of versions) {
        const container = `vscode-${osPlatform}-${osArch}-${version}`;
        const dirname = path.resolve(Host.hostsDirectory, container);
        const file = path.join(dirname, "host.json");
        const executable = "node";

        // Ensure the host directory exists.
        context.trace(`Ensure the hosts directory '${Host.hostsDirectory}' exists...`);
        await fs.promises.mkdir(Host.hostsDirectory, { recursive: true });

        // Check for an existing directory
        context.trace(`Checking for existence of ${file}...`);
        if (fs.existsSync(file)) {
            if (!options.force) {
                context.trace(`Host ${file} exists. Nothing to do.`);
                continue;
            }

            context.trace(`Host ${file} exists. Cleaning up host directory to overwrite...`);
            await fs.promises.rm(dirname, { recursive: true });
        }
        else {
            context.trace(`Host ${file} does not exist. Downloading host...`);
        }

        const codeBin = await download({
            version,
            cachePath: Host.hostsDirectory,
        });

        const downloadedDir = path.dirname(codeBin);
        assert.deepStrictEqual(dirname, downloadedDir, "Downloaded directory does not match expected directory.");

        // Wrapper script which executes the code binary as node, and ensures that it's used as node for any child processes.
        const lines = [
            `#!/usr/bin/env bash`,
            // We could just use codeBin here, but it's better to not encode full paths into this wrapper.
            `CODE_DIR=$(dirname "$(readlink -f "\${BASH_SOURCE[0]}")")`,
            // Ensure that the directory is in the PATH, but not if it's already been overridden.
            `[[ ":$PATH:" == *":$CODE_DIR:"* ]] || export PATH="$CODE_DIR:$PATH"`,
            // https://github.com/microsoft/vscode-languageserver-node/blob/fb0a3d48b9aa1c52d527f623164b0b4f11115d5a/client/src/node/main.ts#L255-L256
            `export ELECTRON_RUN_AS_NODE=1`,
            `export ELECTRON_NO_ASAR=1`,
            // https://github.com/microsoft/vscode/blob/main/scripts/node-electron.sh
            `exec "$CODE_DIR/${path.basename(codeBin)}" "$@" --ms-enable-electron-run-as-node`,
        ];

        await fs.promises.writeFile(path.join(dirname, "node"), lines.join("\n") + "\n", { mode: 0o755 });

        // Create the host.json file
        let host = new Host("vscode", {
            arch: osArch,
            platform: osPlatform,
            version,
            executable,
            executableFile: path.join("${hostDirectory}", container, executable),
            configFile: file,
        });

        if (options.sets) {
            host = host.withPairs(options.sets.map(set => set.split(/=/, 2) as [string, string]));
        }

        await host.saveAsync(file);
        context.log(`${host} installed to hosts.`);
    }

    return unmatchedHosts;
}
