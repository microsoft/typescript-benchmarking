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
