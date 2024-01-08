import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import * as v from "@badrap/valita";

export const RepoInfo = v.object({
    commit: v.string(),
    commitShort: v.string(),
    branch: v.string(),
    date: v.string(),
    timestampDir: v.string(),
});
type RepoInfo = v.Infer<typeof RepoInfo>;

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
