import assert from "node:assert";

import minimist from "minimist";
import { Octokit } from "octokit";

import { getNonEmptyEnv, getRepoInfo, setJobVariable } from "./utils.js";

const auth = getNonEmptyEnv("GH_TOKEN");

const refPrefix = "refs/";

function removeRefPrefix(ref: string) {
    assert(ref.startsWith(refPrefix));
    return ref.slice(refPrefix.length);
}

async function isLatestCommitForRef(ref: string, commit: string) {
    const gh = new Octokit({ auth });
    const latest = await gh.rest.git.getRef({ owner: "microsoft", repo: "TypeScript", ref: removeRefPrefix(ref) });
    const isLatest = latest.data.object.sha === commit;
    console.log(`Latest commit for ${ref} is: ${latest.data.object.sha}`);
    console.log(`This run was for: ${commit}`);
    if (isLatest) {
        console.log("This is the latest commit for this ref.");
    }
    else {
        console.log("This is not the latest commit for this ref.");
    }
    return isLatest;
}

const args = minimist(process.argv.slice(2), {
    string: ["builtDir"],
});

const info = await getRepoInfo(args.builtDir);

// If the current commit is the latest for the given ref, then we save it as such.
// This is generally safe because even if we are currently the most recent build for a ref
// and this returns false, then it must be the case that the newer commit will get enqueued
// at some point in the future.
//
// Note that there is a chance that "latest" will lag behind; if we get lots of merges
// in a row and Pipelines happens to run them in order, then each will say "I'm not latest",
// and skip the upload, until the actual latest happens to run. But, anecdotally, Pipelines
// likes to run builds out of order, often with the _newest_ build first, so this should be fine.
// If this turns out not to be fine, we can come up with something fancier, but since we don't
// use baselines to test PRs anymore, it's likely not harmful.
const ref = getNonEmptyEnv("REF");
const isLatest = await isLatestCommitForRef(ref, info.commit);

setJobVariable("TSPERF_BLOB_LATEST", isLatest);
