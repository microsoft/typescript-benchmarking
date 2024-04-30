import * as fs from "node:fs";
import * as path from "node:path";

import { hostsDirectory, StringComparer } from "@ts-perf/core";

import { HostPattern } from "./hostPattern";
import { HostSpecifier } from "./hostSpecifier";
import { HostSpecifierComponents } from "./hostSpecifierComponents";

const truePattern = /^(t(rue)?|y(es)?|1)$/i;

let cachedHosts: Host[] | undefined;

export interface HostComponents {
    name: string;
    arch?: string;
    platform?: string;
    version?: string;
    executable?: string;
    default?: boolean;
    disabled?: boolean;
    args?: readonly string[];
    npm?: string;
    env?: any;
    current?: boolean;
    executableFile?: string;
    configFile?: string;
}

export interface HostOptions {
    arch?: string;
    platform?: string;
    version?: string;
    executable?: string;
    default?: boolean;
    disabled?: boolean;
    args?: readonly string[];
    npm?: string;
    env?: any;
    current?: boolean;
    executableFile?: string;
    configFile?: string;
}

export class Host {
    public static readonly hostsDirectory = hostsDirectory;
    public static readonly current = new Host("node", {
        executable: process.execPath,
        executableFile: process.execPath,
        platform: process.platform,
        arch: process.arch === "ia32" ? "x86" : process.arch,
        version: process.version,
        default: false,
        current: true,
    });

    public readonly spec: HostSpecifier;
    public readonly name: string;
    public readonly arch?: string;
    public readonly platform?: string;
    public readonly version?: string;
    public readonly executable?: string;
    public readonly default?: boolean;
    public readonly disabled?: boolean;
    public readonly args?: readonly string[];
    public readonly npm?: string;
    public readonly env?: any;
    public readonly current?: boolean;
    public readonly executableFile?: string;
    public readonly configFile?: string;

    constructor(name: string, options?: HostOptions) {
        this.name = name;
        if (options) {
            this.arch = options.arch;
            this.platform = options.platform;
            this.version = options.version;
            this.executable = options.executable;
            this.default = options.default;
            this.disabled = options.disabled;
            this.args = options.args;
            this.npm = options.npm;
            this.env = options.env;
            this.current = options.current;
            this.executableFile = options.executableFile;
            this.configFile = options.configFile;
        }
        this.spec = HostSpecifier.create(this);
    }

    public get installed() {
        return !!this.configFile;
    }
    public get configDirectory() {
        return this.configFile && path.dirname(this.configFile);
    }

    public static create(components: HostComponents) {
        return new Host(components.name, components);
    }

    public static parse(text: string, options?: { executableRoot?: string; configFile?: string; }) {
        const components = JSON.parse(text) as HostComponents;
        components.executableFile = options && options.executableRoot && components.executable
            ? path.join(options.executableRoot, components.executable) : components.executable;
        components.configFile = options && options.configFile;
        return new Host(components.name, components);
    }

    public static async loadAsync(file: string, options?: { executableRoot?: string; }) {
        const text = await fs.promises.readFile(file, "utf8");
        return this.parse(text, { configFile: file, ...options });
    }

    public static async getAvailableHosts(options?: { ignoreCache?: boolean; }) {
        const ignoreCache = options && options.ignoreCache;
        if (!ignoreCache && cachedHosts) {
            return cachedHosts.slice();
        }

        const hosts: Host[] = [];
        if (fs.existsSync(this.hostsDirectory)) {
            for (const container of await fs.promises.readdir(this.hostsDirectory)) {
                const file = path.join(this.hostsDirectory, container, "host.json");
                try {
                    const host = await Host.loadAsync(file, {
                        executableRoot: path.join("${hostsDirectory}", container),
                    });
                    hosts.push(host);
                }
                catch (e) {
                }
            }
        }

        if (hosts.length === 0) {
            if (process.platform === "win32") {
                const testhostExecutable = path.resolve(__dirname, "../../../testhost/testhost.exe");
                if (fs.existsSync(testhostExecutable)) {
                    hosts.push(
                        new Host("testhost", {
                            executable: testhostExecutable,
                            executableFile: testhostExecutable,
                            platform: "win32",
                            arch: "x86",
                            default: true,
                        }),
                    );
                }
            }
        }

        hosts.push(Host.current);
        return (cachedHosts = hosts).slice();
    }

    /*@internal*/ static async _ensureHostsDirectory() {
        await fs.promises.mkdir(this.hostsDirectory, { recursive: true });
    }

    public static async getDefaultHosts(options?: { onlyHosts?: string[]; installed?: boolean; }) {
        const onlyHosts = options && options.onlyHosts;
        const installed = options && options.installed;
        const availableHosts = await this.getAvailableHosts();
        const enabledHosts = availableHosts
            .filter(host =>
                !host.disabled
                && (!host.platform || host.platform === process.platform)
                && (!onlyHosts || onlyHosts.includes(host.name))
                && (!installed || !!host.configFile)
            );
        const defaultHosts = enabledHosts
            .filter(host => host.default);
        return defaultHosts.length > 0 ? defaultHosts : enabledHosts;
    }

    public static async findMatchingHosts(
        hosts: (string | HostSpecifierComponents)[],
        options?: { onlyHosts?: string[]; installed?: boolean; },
    ) {
        const onlyHosts = options && options.onlyHosts;
        const installed = options && options.installed;
        const availableHosts = await this.getAvailableHosts();
        const results = new Set<Host>();
        for (const host of hosts) {
            const pattern = typeof host === "string" ? HostPattern.parse(host) : HostPattern.create(host);
            if (pattern.executable && !(pattern.arch || pattern.version)) {
                if (!installed) {
                    results.add(
                        new Host(pattern.name, { executable: pattern.executable, executableFile: pattern.executable }),
                    );
                }
            }
            else {
                for (const host of availableHosts) {
                    if (!pattern.match(host)) continue;
                    if (host.platform && host.platform !== process.platform) continue;
                    if (onlyHosts && !onlyHosts.includes(host.name)) continue;
                    if (installed && !host.configFile) continue;
                    results.add(host);
                }
            }
        }
        return Array.from(results);
    }

    public static async findHosts(
        hosts?: (string | HostSpecifierComponents)[],
        options?: { onlyHosts?: string[]; installed?: boolean; },
    ) {
        return hosts && hosts.length ? await this.findMatchingHosts(hosts, options)
            : await this.getDefaultHosts(options);
    }

    public static async findHost(host: string | HostSpecifierComponents, options?: { onlyHosts?: string[]; }) {
        const matchingHosts = await this.findHosts(host ? [host] : undefined, options);
        if (matchingHosts.length === 0) {
            return undefined;
        }
        else if (matchingHosts.length === 1) {
            return matchingHosts[0];
        }

        let firstDefaultHost: Host | undefined;
        let firstEnabledHost: Host | undefined;
        let firstHost: Host | undefined;
        for (const host of matchingHosts) {
            if (!firstHost) firstHost = host;
            if (host.default && !firstDefaultHost) firstDefaultHost = host;
            if (!host.disabled && !firstEnabledHost) firstEnabledHost = host;
            if (firstHost && firstDefaultHost && firstEnabledHost) break;
        }

        return firstDefaultHost || firstEnabledHost || firstHost;
    }

    public with(components: HostComponents) {
        const {
            name = this.name,
            arch = this.arch,
            platform = this.platform,
            version = this.version,
            executable = this.executable,
        } = components;
        const {
            default: default_ = this.default,
            disabled = this.disabled,
            args = this.args,
            npm = this.npm,
            env = this.env,
            current = this.current,
        } = components;
        const { executableFile = this.executableFile, configFile = this.configFile } = components;
        if (
            name === this.name
            && arch === this.arch
            && platform === this.platform
            && version === this.version
            && executable === this.executable
            && default_ === this.default
            && disabled === this.disabled
            && args === this.args
            && npm === this.npm
            && env === this.env
            && current === this.current
            && executableFile === this.executableFile
            && configFile === this.configFile
        ) {
            return this;
        }
        return new Host(name, {
            arch: arch || undefined,
            platform: platform || undefined,
            version: version || undefined,
            executable: executable || undefined,
            default: default_ || undefined,
            disabled: disabled || undefined,
            args: args || undefined,
            npm: npm || undefined,
            env: env || undefined,
            current: current || undefined,
            executableFile: executableFile || undefined,
            configFile: configFile || undefined,
        });
    }

    public withPairs(pairs: Iterable<[string, string]>) {
        const components = this.getComponents();
        for (const [key, value] of pairs) {
            if (StringComparer.caseInsensitive.equals("disabled", key)) {
                components.disabled = truePattern.test(value)
                    || StringComparer.caseInsensitive.equals("disabled", value);
            }
            else if (StringComparer.caseInsensitive.equals("default", key)) {
                components.default = truePattern.test(value) || StringComparer.caseInsensitive.equals("default", value);
            }
        }
        return this.with(components);
    }

    public getComponents(): HostComponents {
        const {
            name,
            arch,
            platform,
            version,
            executable,
            default: default_,
            disabled,
            args,
            npm,
            env,
            current,
            executableFile,
            configFile,
        } = this;
        return {
            name,
            arch,
            platform,
            version,
            executable,
            default: default_,
            disabled,
            args,
            npm,
            env,
            current,
            executableFile,
            configFile,
        };
    }

    public async saveAsync(configFile: string) {
        await fs.promises.writeFile(configFile, JSON.stringify(this, undefined, "  "), "utf8");
        cachedHosts = undefined;
    }

    public toString() {
        return this.spec.toString();
    }

    public toJSON(): any {
        const components = this.getComponents();
        delete components.executableFile;
        delete components.configFile;
        return components;
    }
}
