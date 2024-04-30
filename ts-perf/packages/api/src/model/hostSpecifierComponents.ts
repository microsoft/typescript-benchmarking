import * as path from "node:path";

import { StringComparer } from "@ts-perf/core";

const npmLikeHostRegExp = /^([^@]+)(?:@([^@]+)(?:@([^@]+))?)?$/;
const hostSegmentSeparatorRegExp = /[,;]/g;
const hostAttributeRegExp = /^\s*(version|arch|executable)\s*=\s*(.*?)\s*$/i;

export interface HostSpecifierComponents {
    name?: string | null;
    version?: string | null;
    arch?: string | null;
    executable?: string | null;
}

export function pickHostComponents(components: HostSpecifierComponents): HostSpecifierComponents {
    const { name, version, arch, executable } = components;
    return { name, version, arch, executable };
}

export function formatHostComponents(components: HostSpecifierComponents) {
    const { name, version, arch, executable } = components;
    if (executable && name && !version && !arch && path.basename(executable, path.extname(executable)) === name) {
        return executable;
    }
    let text = name;
    if (version) text += `,version=${version}`;
    if (arch) text += `,arch=${arch}`;
    if (executable) text += `,executable=${executable}`;
    return text;
}

export function parseHostComponents(host: string): HostSpecifierComponents {
    // remove unnecessary whitespace
    host = host.trim();

    let name: string | undefined;
    let version: string | undefined;
    let arch: string | undefined;
    let executable: string | undefined;
    if (mayBeJson(host)) {
        // parse JSON pattern
        const parts = JSON.parse(host) as HostSpecifierComponents;
        name = typeof parts.name === "string" ? parts.name : undefined;
        executable = typeof parts.executable === "string" ? parts.executable : undefined;
        version = typeof parts.version === "string" ? parts.version : undefined;
        arch = typeof parts.arch === "string" ? parts.arch : undefined;
    }
    else {
        const match = npmLikeHostRegExp.exec(host);
        if (match) {
            [, name, version, arch] = match;
        }
        else {
            // parse string pattern
            const parts = host.split(hostSegmentSeparatorRegExp);
            name = parts[0];
            for (let i = 1; i < parts.length; i++) {
                const part = parts[i].trim();
                const m = hostAttributeRegExp.exec(part);
                if (m) {
                    if (StringComparer.caseInsensitive.equals("version", m[1])) {
                        version = m[2].trim();
                        continue;
                    }
                    else if (StringComparer.caseInsensitive.equals("arch", m[1])) {
                        arch = m[2].trim();
                        continue;
                    }
                    else if (StringComparer.caseInsensitive.equals("executable", m[1])) {
                        executable = m[2].trim();
                        continue;
                    }
                    else {
                        throw new Error(`Unrecognized attribute: '${m[1]}'.`);
                    }
                }
                throw new Error(`Unrecognized segment: '${part}'.`);
            }
        }
    }
    return { name, version, arch, executable };
}

function mayBeJson(text: string) {
    if (text.length >= 2) {
        const first = text.charAt(0);
        const last = text.charAt(text.length - 1);
        return first === "{" && last === "}";
    }
    return false;
}
