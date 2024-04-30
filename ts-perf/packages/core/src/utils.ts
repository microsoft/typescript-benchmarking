import * as os from "node:os";
import * as path from "node:path";
import { StringComparer } from "./stringComparer";

export const userDirectory = path.resolve(os.homedir(), ".tsperf");
export const hostsDirectory = path.resolve(userDirectory, "hosts");
export const localScenariosDirectory = path.resolve(userDirectory, "scenarios");
export const localSuiteDirectory = path.resolve(userDirectory, "solutions");
export const logDirectory = path.resolve(userDirectory, "logs");

export class ProcessExitError extends Error {
    readonly exitCode!: number;

    constructor(message?: string);
    constructor(exitCode: number, message?: string);
    constructor(...args: [string?] | [number, string?]) {
        if (ProcessExitError.isExitCodeOverload(args)) {
            const exitCode = args[0];
            const message = args[1] || `Process exited with code ${exitCode}.`;
            super(message);
            this.exitCode = exitCode;
        }
        else {
            const message = args[0];
            super(message);
            this.exitCode = 0;
        }
    }

    toJSON() {
        return { exitCode: this.exitCode };
    }

    private static isExitCodeOverload(args: any): args is [number, string?] {
        return typeof args[0] === "number";
    }
}

const normalizedWindowsLongPathPrefix = "//?/"; // actually \\?\, but normalized to /

function normalizeSlashes(x: string) {
    return x.replace(/\\/g, "/");
}

function trimTrailingDirectorySeparator(x: string) {
    return x.length > 1 && x.endsWith("/") ? x.slice(0, -1) : x;
}

export function containsPath(parent: string, child: string, comparer = StringComparer.caseSensitive) {
    if (!path.isAbsolute(parent)) throw new TypeError("'parent' must be an absolute path");
    if (!path.isAbsolute(child)) throw new TypeError("'child' must be an absolute path");

    // shortcut when identitcal
    if (parent === child) return true;
    parent = trimTrailingDirectorySeparator(normalizeSlashes(parent));
    child = trimTrailingDirectorySeparator(normalizeSlashes(child));

    if (parent.startsWith(normalizedWindowsLongPathPrefix)) parent = parent.slice(normalizedWindowsLongPathPrefix.length);
    if (child.startsWith(normalizedWindowsLongPathPrefix)) child = child.slice(normalizedWindowsLongPathPrefix.length);
    if (comparer.equals(parent, child)) return true;

    const parentParts = parent.split("/");
    if (parentParts.length === 0) return true;

    const childParts = child.split("/");
    if (childParts.length < parentParts.length) return false;

    let start = 0;
    if (/^[a-z]:$/i.test(parentParts[0]) || /^[a-z]:$/i.test(childParts[0])) {
        // always treat windows drive indicator as case insensitive
        if (!StringComparer.caseInsensitive.equals(parentParts[0], childParts[0])) {
            return false;
        }
        start++;
    }

    for (let i = start; i < parentParts.length; i++) {
        const parentPart = parentParts[i];
        const childPart = childParts[i];
        if (!comparer.equals(parentPart, childPart)) {
            return false;
        }
    }

    return true;
}
