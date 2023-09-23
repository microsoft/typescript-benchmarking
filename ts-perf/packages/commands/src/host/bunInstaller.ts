import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { Host, HostPattern } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import fetch from "node-fetch";
import * as semver from "semver";
import * as tmp from "tmp";

import { InstallHostOptions } from "./install";
import { ListHostsOptions } from "./list";
import { pipeAsync } from "./utils";

const osPlatform = os.platform();
const osArch = os.arch() === "ia32" ? "x86" : os.arch();

export async function listInstallableBunHosts(options: ListHostsOptions, host: HostContext) {
    // TODO
}

export async function installMatchingBunHosts(options: InstallHostOptions, context: HostContext): Promise<string[]> {
    if (osPlatform !== "linux" || osArch !== "x64") {
        context.error(`Bun hosts can only be installed on linux-x64.`);
        return options.hosts;
    }

    const unmatchedHosts: string[] = [];
    const versions: string[] = [];

    for (const testHost of options.hosts) {
        const hostPattern = HostPattern.parse(testHost);
        if (!hostPattern.partialMatch({ name: "bun" })) {
            unmatchedHosts.push(testHost);
            continue;
        }
        versions.push(`v${semver.valid(hostPattern.version || "", false)}`);
    }

    if (versions.length === 0) {
        return unmatchedHosts;
    }

    for (const version of versions) {
        const container = `bun-${version}-${osPlatform}-${osArch}`;
        const zipName = `bun-${osPlatform}-${osArch}`;
        const dirname = path.resolve(Host.hostsDirectory, container);
        const file = path.join(dirname, "host.json");
        const executable = path.join(zipName, "bun");

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

        // Download the file.
        const fileUrl = `https://github.com/oven-sh/bun/releases/download/bun-${version}/${zipName}.zip`;
        context.log(`Downloading ${fileUrl}...`);

        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Could not download '${fileUrl}'; ${response.status} ${response.statusText}`);
        const content = response.body;
        const tempFile = tmp.fileSync({ prefix: path.basename(fileUrl) }).name;
        let cleanupTempFile = true;

        try {
            const output = fs.createWriteStream(tempFile);
            await pipeAsync(content, output, { end: true });
            context.trace(`Downloaded ${fileUrl} to '${tempFile}'.`);

            // TODO: compare the shasums

            // For a linux platform, unpack the archive
            const archive = path.resolve(Host.hostsDirectory, `${container}.zip`);

            context.trace(`Moving '${tempFile}' to '${archive}'...`);
            const source = fs.createReadStream(tempFile);
            const dest = fs.createWriteStream(archive);
            await pipeAsync(source, dest, { end: true });
            await fs.promises.unlink(tempFile);
            cleanupTempFile = false;

            context.log(`Unpacking...`);
            const outDir = path.resolve(Host.hostsDirectory, container);
            context.trace(`unzip ${archive} -d ${outDir}`);
            await new Promise<void>((resolve, reject) => {
                child_process.exec(`unzip ${archive} -d ${outDir}`, (err, stdout, stderr) => {
                    if (stdout) context.trace(stdout);
                    if (stderr) context.error(stderr);
                    if (err) {
                        reject(err);
                    }
                    else {
                        resolve();
                    }
                });
            });

            // Create the host.json file
            let host = new Host("bun", {
                arch: osArch,
                platform: osPlatform,
                version,
                executable,
                executableFile: path.join("${hostDirectory}", container, executable),
                configFile: file,
                args: ["run", "--"],
            });

            if (options.sets) {
                host = host.withPairs(options.sets.map(set => set.split(/=/, 2) as [string, string]));
            }

            await host.saveAsync(file);
            context.log(`${host} installed to hosts.`);
        }
        finally {
            if (cleanupTempFile) {
                await fs.promises.unlink(tempFile);
            }
        }
    }

    return unmatchedHosts;
}
