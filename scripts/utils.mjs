import * as v from "@badrap/valita";

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
