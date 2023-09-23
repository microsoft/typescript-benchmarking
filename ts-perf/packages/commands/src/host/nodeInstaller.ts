import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as url from "node:url";

import { Host, HostPattern, HostSpecifier } from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";
import { fn, from, QueriedType } from "iterable-query";
import fetch from "node-fetch";
import * as semver from "semver";
import { Table } from "table-style";
import * as tmp from "tmp";

import { InstallHostOptions } from "./install";
import { ListHostsOptions } from "./list";
import { pipeAsync } from "./utils";

interface Release {
    version: string;
    date: string;
    files: string[];
    npm: string;
    v8: string;
    uv: string;
    zlib: string;
    openssl: string;
    modules: string;
    lts: boolean | string;
}

interface UrlPatterns {
    readonly baseUrl: string;
    readonly patterns: Readonly<Record<string, string>>;
}

const downloadUrls: UrlPatterns = {
    baseUrl: "https://nodejs.org",
    patterns: {
        index: "/download/release/index.json",
        shasums256: "/download/release/${version}/SHASUMS256.txt",
        linux: "/download/release/${version}/node-${version}-linux-${arch}.tar.xz",
        win32: "/download/release/${version}/win-${arch}/node.exe",
        win32_x86_pre4: "/download/release/${version}/node.exe",
        win32_x64_pre4: "/download/release/${version}/x64/node.exe",
    },
};

async function getReleases(host?: HostContext): Promise<Release[]> {
    const indexUrl = formatUrl("${index}", downloadUrls);
    if (host) host.trace(`Downloading '${indexUrl}'...`);
    const response = await fetch(indexUrl);
    if (!response.ok) throw new Error(`Could not download '${indexUrl}'; ${response.status} ${response.statusText}`);
    return response.json();
}

const filePattern = /^([^-]+)(?:-([^-]+)(?:-([^-]+))?)?$/;

function matchReleases(
    releases: Iterable<Release>,
    pattern: HostPattern,
    { maxSatisfying = true, platform = os.platform() } = {},
) {
    const candidateReleases: Release[] = [];
    const candidateVersions: string[] = [];
    for (
        const release of from(releases).orderByDescending(
            release => release.version,
            (a, b) => semver.compare(a, b, true),
        )
    ) {
        if (isCandidateRelease(release, pattern, platform)) {
            candidateReleases.push(release);
            if (pattern.version === "latest") break;
            candidateVersions.push(release.version);
        }
    }
    if (maxSatisfying && semver.validRange(pattern.version, true)) {
        const max = semver.maxSatisfying(candidateVersions, pattern.version, true);
        return candidateReleases.filter(release => release.version === max);
    }
    return candidateReleases;
}

function isCandidateRelease(release: Release, pattern: HostPattern, platform: string) {
    return hasCandidateVersion(release, pattern)
        && hasCandidatePlatformFile(release, pattern, platform);
}

function hasCandidateVersion(release: Release, pattern: HostPattern) {
    if (pattern.version === "latest") return true;
    if (pattern.version === "lts") return !!release.lts;
    if (pattern.version.startsWith("lts:")) return release.lts && pattern.version === `lts:${release.lts}`;
    return semver.satisfies(release.version, pattern.version, true);
}

function hasCandidatePlatformFile(release: Release, pattern: HostPattern, platform: string) {
    for (const file of release.files) {
        if (isCandidatePlatformFile(file, pattern, platform)) return true;
    }
    return false;
}

function isCandidatePlatformFile(file: string, pattern: HostPattern, platform: string) {
    const match = filePattern.exec(file);
    if (!match) return false;
    const [, filePlatform, arch, type] = match;
    if (filePlatform !== platform && !(platform === "win32" && filePlatform === "win")) return false;
    if (pattern.arch !== "*" && pattern.arch !== arch) return false;
    return filePlatform !== "win" || type === "exe";
}

interface PlatformAndArchitecture {
    platform: NodeJS.Platform;
    arch: string;
}

function getSupportedPlatformsAndArchitectures(release: Release) {
    const supportedPlatforms: PlatformAndArchitecture[] = [];
    for (const file of release.files) {
        const match = filePattern.exec(file);
        if (!match || (match[2] !== "x86" && match[2] !== "x64")) continue;
        switch (match[1]) {
            case "linux":
                if (match[3]) continue;
                supportedPlatforms.push({ platform: "linux", arch: match[2] });
                break;
            case "win":
            case "win32":
                if (match[3] !== "exe") continue;
                supportedPlatforms.push({ platform: "win32", arch: match[2] });
                break;
        }
    }
    return [...supportedPlatforms];
}

function getHostSpecifier(release: Release, arch: string, platform = os.platform()) {
    const specifier = new HostSpecifier("node", release.version, arch);
    if (!isCandidateRelease(release, HostPattern.create(specifier), platform)) {
        throw new Error(`Platform '${platform} (${arch})' is not valid for release '${release.version}.`);
    }
    return specifier;
}

function getDownloadUrl(spec: HostSpecifier, platform = os.platform()) {
    const version = semver.valid(spec.version || "", false);
    const arch = spec.arch;
    if (spec.name !== "node" || !version || !arch) throw new Error(`Invalid host specifier: '${spec}'`);

    const urlPatterns: UrlPatterns = {
        ...downloadUrls,
        patterns: {
            ...downloadUrls.patterns,
            version: ensureVersionPrefix(version),
            arch,
            platform,
        },
    };

    let downloadPattern: string;
    if (platform === "win32") {
        downloadPattern = semver.lt(version, "4.0.0") ? arch === "${x64}" ? "win32_x64_pre4" : "${win32_x86_pre4}"
            : "${win32}";
    }
    else if (platform === "linux") {
        downloadPattern = "${linux}";
    }
    else {
        throw new Error(`Unsupported platform: '${platform}`);
    }

    return formatUrl(downloadPattern, urlPatterns);
}

function expandPathname(pathname: string, patterns: Record<string, string>, seen: Set<string>): string {
    return pathname.replace(/\$\{([^}]+)\}/g, (_, key) => expandPattern(key, patterns, seen));
}

function expandPattern(key: string, patterns: Record<string, string>, seen: Set<string>): string {
    if (seen.has(key)) throw new Error(`Recursive expansion of '${key}'`);
    const pattern = patterns[key];
    if (!pattern) throw new Error(`Pattern named '${key}' not found.`);
    seen.add(key);
    const result = expandPathname(pattern, patterns, seen);
    seen.delete(key);
    return result;
}

function formatUrl(pathname: string, patterns: UrlPatterns) {
    return url.resolve(patterns.baseUrl, expandPathname(pathname, patterns.patterns, new Set()));
}

function ensureVersionPrefix(version: string) {
    return version.charAt(0) !== "v" ? `v${version}` : version;
}

const osPlatform = os.platform();
const osArch = os.arch() === "ia32" ? "x86" : os.arch();

function isInstallableArch(arch: string) {
    if (arch === osArch) return true;
    return arch === "x86" && osArch === "x64";
}

export async function listInstallableNodeHosts(options: ListHostsOptions, host: HostContext) {
    const limit = options.limit || Number.MAX_SAFE_INTEGER;
    const hostPattern = HostPattern.parse(options.host || "node");
    const releases = matchReleases(await getReleases(), hostPattern, { maxSatisfying: false });
    const installedHosts = await Host.getAvailableHosts();
    const hosts = from(releases)
        .selectMany(
            getSupportedPlatformsAndArchitectures,
            (release, { platform, arch }) => ({
                ...release,
                platform,
                arch,
                spec: getHostSpecifier(release, arch, platform),
            }),
        )
        .where(release => release.platform === osPlatform && isInstallableArch(release.arch))
        .groupJoin(
            installedHosts,
            release => release.spec.toString(),
            installedHost => installedHost.spec.toString(),
            (release, installed) => ({
                name: "node",
                version: release.version,
                arch: release.arch,
                installed: installed.some(),
                npm: release.npm,
                v8: release.v8,
                lts: release.lts,
            }),
        )
        .orderByDescending(release => release.version, (a, b) => semver.compare(a, b))
        .thenByDescending(release => release.arch)
        .groupBy(release => release.version, fn.identity, (version, releases) => ({
            name: "node",
            version,
            arch: releases.select(release => release.arch).distinct().toArray().join(", "),
            installed: releases.some(release => release.installed),
            v8: releases.select(release => release.v8).distinct().toArray().join(", "),
            lts: releases.select(release => release.lts).where(lts => !!lts).distinct().toArray().join(", "),
            npm: releases.select(release => release.npm).distinct().toArray().join(", "),
            more: 0,
        }))
        .groupBy(release => semver.major(release.version), fn.identity, (major, [...elements]) => {
            return elements.length <= limit ? elements : [...elements.slice(0, limit), {
                name: "node",
                version: `v${major}.0.0`,
                arch: "...",
                installed: false,
                npm: "...",
                v8: "...",
                lts: "...",
                more: elements.length - limit,
            }];
        })
        .selectMany(releases => releases);
    host.log(
        "Installable Hosts:" + os.EOL + new Table<QueriedType<typeof hosts>>({
            useColor: options.color,
            group: [
                { by: x => `v${semver.major(x.version)}` },
            ],
            columns: [
                {
                    header: "Version",
                    expression: x =>
                        x.more ? `${x.more} more...` : `${x.version || ""}${x.installed ? " (installed)" : ""}`,
                },
                { header: "Arch", expression: x => x.more ? `...` : x.arch || "" },
                { header: "npm", key: "npm" },
                { header: "v8", key: "v8" },
                { header: "lts", expression: x => x.more ? `...` : x.lts ? x.lts : "" },
            ],
            rowStyles: [
                "*",
                { match: (x: QueriedType<typeof hosts>) => !!x.installed, foregroundColor: "dark-gray" },
            ],
        }).render(hosts),
    );
}

export async function installMatchingNodeHosts(options: InstallHostOptions, context: HostContext): Promise<string[]> {
    const unmatchedHosts: string[] = [];

    const releases = await getReleases(context);
    const releasesToInstall: { release: Release; spec: HostSpecifier; }[] = [];
    for (const testHost of options.hosts) {
        const hostPattern = HostPattern.parse(testHost);
        if (!hostPattern.partialMatch({ name: "node" })) {
            unmatchedHosts.push(testHost);
            continue;
        }

        // Get the associated release
        const matchedReleases = matchReleases(releases, hostPattern);
        if (matchedReleases.length === 0) {
            context.error(`Could not find a release matching '${testHost}'.`);
            continue;
        }

        for (const release of matchedReleases) {
            for (const { platform, arch } of getSupportedPlatformsAndArchitectures(release)) {
                if (platform === osPlatform && hostPattern.partialMatch({ arch })) {
                    releasesToInstall.push({ release, spec: getHostSpecifier(release, arch) });
                }
            }
        }
    }

    for (const { release, spec } of releasesToInstall) {
        // Fix the version in the options
        const { version, arch } = spec;
        const container = `node-${version}-${process.platform}-${arch}`;
        const dirname = path.resolve(Host.hostsDirectory, container);
        const file = path.join(dirname, "host.json");

        // Ensure the host directory exists.
        context.trace(`Ensure the hosts directory '${Host.hostsDirectory}' exists...`);
        await fs.promises.mkdir(Host.hostsDirectory, { recursive: true });

        // Check for an existing directory
        context.trace(`Checking for existance of ${file}...`);
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
        const fileUrl = getDownloadUrl(spec);
        context.log(`Downloading ${fileUrl}...`);

        const response = await fetch(fileUrl);
        if (!response.ok) throw new Error(`Could not download '${fileUrl}'; ${response.status} ${response.statusText}`);
        const content = response.body;
        const tempFile = tmp.fileSync({ prefix: path.basename(fileUrl) }).name;
        let cleanupTempFile = true;
        let executable: string | undefined;
        let npm: string | undefined;
        try {
            const output = fs.createWriteStream(tempFile);
            await pipeAsync(content, output, { end: true });
            context.trace(`Downloaded ${fileUrl} to '${tempFile}'.`);

            // TODO: compare the shasums

            if (process.platform === "linux") {
                // For a linux platform, unpack the archive
                const archive = path.resolve(Host.hostsDirectory, path.basename(fileUrl));

                context.trace(`Moving '${tempFile}' to '${archive}'...`);
                const source = fs.createReadStream(tempFile);
                const dest = fs.createWriteStream(archive);
                await pipeAsync(source, dest, { end: true });
                await fs.promises.unlink(tempFile);
                cleanupTempFile = false;

                context.log(`Unpacking...`);
                context.trace(`tar -x --xz -f ${archive} -C ${Host.hostsDirectory}`);
                await new Promise<void>((resolve, reject) => {
                    child_process.exec(`tar -x --xz -f ${archive} -C ${Host.hostsDirectory}`, (err, stdout, stderr) => {
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

                executable = "bin/node";
                npm = "lib/node_modules/npm/bin/npm-cli.js";
            }
            else {
                // On Windows, copy the file
                const file = path.resolve(dirname, "node.exe");

                // Ensure the host directory exists.
                context.trace(`Creating host directory '${dirname}'...`);
                await fs.promises.mkdir(dirname, { recursive: true });

                context.trace(`Moving '${tempFile}' to '${file}'...`);
                const source = fs.createReadStream(tempFile);
                const dest = fs.createWriteStream(file);
                await pipeAsync(source, dest, { end: true });
                await fs.promises.unlink(tempFile);

                cleanupTempFile = false;
                executable = "node.exe";

                // fetch the correct version of npm.
                if (release.npm) {
                    // create a package.json to install npm relative to the host
                    await fs.promises.writeFile(
                        path.join(dirname, "package.json"),
                        JSON.stringify({ private: true }),
                        "utf8",
                    );

                    context.log(`Installing npm ${release.npm}...`);
                    await new Promise<void>((resolve, reject) => {
                        context.trace(`npm install npm@${release.npm}`);
                        child_process.exec(
                            `npm install npm@${release.npm}`,
                            { cwd: dirname },
                            (err, stdout, stderr) => {
                                if (stdout) context.trace(stdout);
                                if (stderr) context.trace(stderr);
                                if (err) {
                                    reject(err);
                                }
                                else {
                                    resolve();
                                }
                            },
                        );
                    });

                    // remove the package.json
                    await fs.promises.unlink(path.join(dirname, "package.json"));

                    npm = "node_modules/npm/bin/npm-cli.js";
                }
            }

            // Create the host.json file
            let host = new Host("node", {
                arch,
                platform: process.platform,
                version,
                executable,
                npm,
                executableFile: path.join("${hostDirectory}", container, executable),
                configFile: file,
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
