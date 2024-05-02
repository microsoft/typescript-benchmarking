import { StringComparer } from "@ts-perf/core";

import { VersionComparer } from "../utils";
import {
    formatHostComponents,
    HostSpecifierComponents,
    parseHostComponents,
    pickHostComponents,
} from "./hostSpecifierComponents";

const invalidHostPatternRegExp = /[,;=]/;

export class HostPattern {
    public readonly name: string;
    public readonly version: string;
    public readonly arch: string;
    public readonly executable: string;

    constructor(name?: string, version?: string, arch?: string, executable?: string) {
        if (name && invalidHostPatternRegExp.test(name)) throw new Error("invalid argument: name");
        if (version && invalidHostPatternRegExp.test(version)) throw new Error("invalid argument: version");
        if (arch && invalidHostPatternRegExp.test(arch)) throw new Error("invalid argument: arch");
        this.name = name || "*";
        this.version = version || "*";
        this.arch = arch || "*";
        this.executable = executable || "*";
    }

    public with(components: HostSpecifierComponents) {
        const { name = this.name, version = this.version, arch = this.arch, executable = this.executable } = components;
        if (name === this.name && version === this.version && arch === this.arch && executable === this.executable) {
            return this;
        }
        return new HostPattern(name || "*", version || "*", arch || "*", executable || "*");
    }

    public getComponents() {
        return pickHostComponents(this);
    }

    public toString() {
        return formatHostComponents(this);
    }

    public toJSON(): any {
        return pickHostComponents(this);
    }

    public match(components: HostSpecifierComponents) {
        return (this.name === "*" || StringComparer.caseInsensitive.equals(this.name, components.name))
            && (this.version === "*" || VersionComparer.default.satisfies(components.version, this.version))
            && (this.arch === "*" || StringComparer.caseInsensitive.equals(this.arch, components.arch))
            && (this.executable === "*" || StringComparer.fileSystem.equals(this.executable, components.executable));
    }

    public partialMatch(components: HostSpecifierComponents) {
        return this.match({ ...this.getComponents(), ...components });
    }

    public static create(components: HostSpecifierComponents) {
        if (components instanceof HostPattern) {
            return components;
        }

        const { name, version, arch, executable } = components;
        return new HostPattern(name!, version!, arch!, executable!);
    }

    public static parse(host: string): HostPattern {
        return this.create(parseHostComponents(host));
    }
}
