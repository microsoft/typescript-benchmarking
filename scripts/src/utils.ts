import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import * as v from "@badrap/valita";
import { $ as _$ } from "execa";

export const $pipe = _$({ verbose: "short" });
export const $ = _$({ verbose: "short", stdio: "inherit" });

const RepoInfo = v.object({
    commit: v.string(),
    commitShort: v.string(),
    branch: v.string().optional(),
    date: v.string(),
    timestampDir: v.string(),
});
export type RepoInfo = v.Infer<typeof RepoInfo>;

export async function retry<T>(fn: () => Promise<T>, count = 3, wait = 5) {
    let lastError;

    while (count > 0) {
        count--;
        try {
            return await fn();
        }
        catch (e) {
            console.error(e);
            lastError = e;
            if (count === 0) {
                break;
            }
            await sleepSeconds(wait);
        }
    }

    throw lastError;
}

/**
 * @param {number} seconds
 */
export function sleepSeconds(seconds: number) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export function checkNonEmpty<T extends {}>(x: T | undefined, message: string): T {
    assert(x, message);
    return x;
}

export function getNonEmptyEnv(name: string) {
    const value = process.env[name];
    assert(value, `Expected ${name} environment variable to be set`);
    return value;
}

export async function getRepoInfo(builtDir: string) {
    assert(builtDir, "Expected non-empty builtDir");
    const repoInfoPath = path.join(builtDir, "info.json");
    const parsed = JSON.parse(await fs.promises.readFile(repoInfoPath, { encoding: "utf8" }));
    return RepoInfo.parse(parsed);
}

export function setOutputVariable(name: string, value: string | number | boolean) {
    console.log(`setting output ${name}=${value}`);
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
}

export function setJobVariable(name: string, value: string | number | boolean) {
    console.log(`setting variable ${name}=${value}`);
    console.log(`##vso[task.setvariable variable=${name}]${value}`);
}

export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toUpperCase() === "TRUE";
}

// Azure Pipelines recognizes logging commands anywhere in a line. Break their markers
// rather than prefixing output, so diagnostic and artifact text remains data.
const loggingCommandRegExp = /##(?=\[|vso\[)/g;

export function defangLoggingCommands(text: string): string {
    return text.replace(loggingCommandRegExp, "# #");
}

export async function validateBuildOutput(source: string) {
    async function validate(file: string): Promise<void> {
        const stat = await fs.promises.lstat(file);
        if (stat.isDirectory()) {
            for (const name of await fs.promises.readdir(file)) {
                assert(
                    !/[\u0000-\u001F\u007F-\u009F]/.test(name) && defangLoggingCommands(name) === name,
                    `Unsafe build output filename ${JSON.stringify(defangLoggingCommands(name))}`,
                );
                await validate(path.join(file, name));
            }
        }
        else {
            assert(stat.isFile(), `Unexpected build output at ${defangLoggingCommands(file)}`);
        }
    }

    assert((await fs.promises.lstat(source)).isDirectory(), "Expected a regular build output directory");
    await validate(source);
}
