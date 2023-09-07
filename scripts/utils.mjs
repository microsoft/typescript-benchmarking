/*! Copyright (c) Microsoft Corporation.
    Licensed under the MIT License. */

import * as v from "@badrap/valita";
import assert from "assert";
import fs from "fs";
import path from "path";

/**
 * @typedef {v.Infer<typeof RepoInfo>} RepoInfo
 */
export const RepoInfo = v.object({
    commit: v.string(),
    commitShort: v.string(),
    branch: v.string(),
    date: v.string(),
    timestampDir: v.string(),
});

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {number} [count]
 * @param {number} [wait]
 */
export async function retry(fn, count = 3, wait = 5) {
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
export function sleepSeconds(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

/** @type {<T extends {}>(x: T | undefined | null, message: string) => T} */
export function checkNonEmpty(x, message) {
    assert(x, message);
    return x;
}

/**
 * @param {string} name
 */
export function getNonEmptyEnv(name) {
    const value = process.env[name];
    assert(value, `Expected ${name} environment variable to be set`);
    return value;
}

/**
 * @param {string} builtDir
 * @returns {Promise<RepoInfo>}
 */
export async function getRepoInfo(builtDir) {
    assert(builtDir, "Expected non-empty builtDir");
    const repoInfoPath = path.join(builtDir, "info.json");
    const parsed = JSON.parse(await fs.promises.readFile(repoInfoPath, { encoding: "utf8" }));
    return RepoInfo.parse(parsed);
}
