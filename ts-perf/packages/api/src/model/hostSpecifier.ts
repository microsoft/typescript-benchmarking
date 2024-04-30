import * as path from "node:path";

import { StringComparer } from "@ts-perf/core";

import { VersionComparer } from "../utils";
import {
    formatHostComponents,
    HostSpecifierComponents,
    parseHostComponents,
    pickHostComponents,
} from "./hostSpecifierComponents";

const invalidHostSegmentRegExp = /[,;=*^<>]/;

export class HostSpecifier {
    public readonly name: string;
    public readonly version: string | undefined;
    public readonly arch: string | undefined;
    public readonly executable: string | undefined;

    constructor(name: string, version?: string, arch?: string, executable?: string) {
        if (!name || invalidHostSegmentRegExp.test(name)) throw new Error("invalid argument: name");
        if (version && invalidHostSegmentRegExp.test(version)) throw new Error("invalid argument: version");
        if (arch && invalidHostSegmentRegExp.test(arch)) throw new Error("invalid argument: arch");
        this.name = name;
        this.version = version || undefined;
        this.arch = arch || undefined;
        this.executable = executable || undefined;
    }

    public with(components: HostSpecifierComponents) {
        const { name = this.name } = components;
        const { version = this.version } = components;
        const { arch = this.arch } = components;
        const { executable = this.executable } = components;
        if (
            name === this.name
            && version === this.version
            && arch === this.arch
            && executable === this.executable
        ) {
            return this;
        }
        return new HostSpecifier(name!, version!, arch!, executable!);
    }

    public getComponents() {
        return pickHostComponents(this);
    }

    public toString(format: "specifier" | "display" = "specifier") {
        switch (format) {
            case "specifier":
                return this.toSpecifierString();
            case "display":
                return this.toDisplayString();
        }
    }

    public toSpecifierString() {
        return formatHostComponents(this);
    }

    public toDisplayString() {
        let name = this.name;
        if (this.version || this.arch) {
            name += " (";
            if (this.version) {
                name += this.version;
                if (this.arch) {
                    name += ", ";
                }
            }
            if (this.arch) {
                name += this.arch;
            }
            name += ")";
        }
        return name;
    }

    public toJSON(): any {
        const { name, version, arch, executable } = this;
        return executable && !version && !arch ? { name, executable } : { name, version, arch };
    }

    public compare(other: HostSpecifier): number {
        return HostSpecifier.compare(this, other);
    }

    public equals(other: HostSpecifier): boolean {
        return HostSpecifier.equals(this, other);
    }

    public static create(components: HostSpecifierComponents) {
        if (components instanceof HostSpecifier) {
            return components;
        }

        return new HostSpecifier(
            components.name!,
            components.version!,
            components.arch!,
            components.executable!,
        );
    }

    public static file(executable: string, name?: string) {
        if (!name) name = path.basename(executable, path.extname(executable));
        if (invalidHostSegmentRegExp.test(name)) throw new Error("invalid argument: name");
        return new HostSpecifier(name, undefined, undefined, executable);
    }

    public static parse(host: string): HostSpecifier {
        return this.create(parseHostComponents(host));
    }

    public static compare(x: HostSpecifier, y: HostSpecifier): number {
        if (x === y) return 0;
        if (!x) return -1;
        if (!y) return +1;
        return StringComparer.caseInsensitive.compare(x.name, y.name)
            || VersionComparer.default.compare(x.version, y.version)
            || StringComparer.caseInsensitive.compare(x.arch, y.arch)
            || StringComparer.fileSystem.compare(x.executable, y.executable);
    }

    public static equals(x: HostSpecifier, y: HostSpecifier): boolean {
        if (x === y) return true;
        if (!x) return false;
        if (!y) return false;
        return StringComparer.caseInsensitive.equals(x.name, y.name)
            && VersionComparer.default.equals(x.version, y.version)
            && StringComparer.caseInsensitive.equals(x.arch, y.arch)
            && StringComparer.fileSystem.equals(x.executable, y.executable);
    }
}
