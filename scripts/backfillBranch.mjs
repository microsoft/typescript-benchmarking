import assert from "assert";
import vsts from "azure-devops-node-api";
import dotenv from "dotenv";
import { execa } from "execa";
import { appendFileSync, readFileSync } from "fs";
import minimist from "minimist";
import ora from "ora";

import { sleepSeconds } from "./utils.mjs";

dotenv.config();

const args = minimist(process.argv.slice(2), {
    string: ["seen", "checkout", "start-commit", "branch", "pipeline"],
    default: {
        pipeline: 69,
        branch: "main",
    },
});

const seenFilename = args.seen;
assert(seenFilename, "Must provide --seen");

const checkout = args.checkout;
assert(checkout, "Must provide --checkout");

const startCommit = args["start-commit"];
assert(seenFilename, "Must provide --start-commit");

const branch = args.branch;
assert(branch, "Must provide --branch");

const pipeline = args.pipeline;
assert(pipeline, "Must provide --pipeline");

const vstsToken = process.env.VSTS_TOKEN;
assert(vstsToken, "Must provide VSTS_TOKEN environment variable.");

try {
    await execa("git", ["merge-base", "--is-ancestor", startCommit, branch], { cwd: checkout });
}
catch {
    console.error(`Start commit ${startCommit} is not an ancestor of ${branch}`);
    process.exit(1);
}

const unset = Symbol();

/**
 * @type {<T>(fn: () => T) => () => T}
 */
function memoize(fn) {
    /** @type {any} */
    let v = unset;
    return () => {
        if (v !== unset) {
            return v;
        }
        return (v = fn());
    };
}

const project = "cf7ac146-d525-443c-b23c-0d58337efebc";

const getBuildApi = memoize(() => {
    const token = process.env.VSTS_TOKEN;
    assert(token);

    const vstsTypescript = new vsts.WebApi(
        "https://typescript.visualstudio.com/defaultcollection",
        vsts.getPersonalAccessTokenHandler(token),
    );
    return vstsTypescript.getBuildApi();
});

async function getPendingBuildCount() {
    const build = await getBuildApi();
    const builds = await build.getBuilds(
        project,
        [args.pipeline],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        /** @type {any} */ (1 | 32), // BuildStatus.InProgress | BuildStatus.NotStarted
    );
    return builds.length;
}

/**
 * @typedef {{
 *     resources?: {
 *         repositories?: Record<string, { refName?: string; version?: string } | undefined>;
 *     };
 *     variables?: Record<string, { isSecret?: boolean; value?: string; } | undefined>;
 *     templateParameters?: Record<string, string | number | boolean | undefined>;
 * }} PipelineRunArgs
 *
 * @typedef {{
 *     _links: { web: { href: string }; };
 * }} PipelineRunResult
 */

/**
 * @param {number} pipelineId
 * @param {PipelineRunArgs} args
 * @returns {Promise<PipelineRunResult>}
 */
async function runPipeline(pipelineId, args) {
    const build = await getBuildApi();

    // https://github.com/microsoft/azure-devops-go-api/blob/8dbf8bfd3346f337d914961fab01df812985dcb8/azuredevops/v7/pipelines/client.go#L446
    const verData = await build.vsoClient.getVersioningData(
        "7.1-preview.1",
        "pipelines",
        "7859261e-d2e9-4a68-b820-a5d84cc5bb3d",
        { project, pipelineId },
    );
    const url = verData.requestUrl;
    const options = build.createRequestOptions("application/json", verData.apiVersion);
    assert(url);

    const response = await build.rest.create(url, args, options);
    return response.result;
}
/**
 * @typedef {{
 *     hash: string;
 *     subject: string;
 *     date: string;
 * }} Commit
 * @param {string} range
 * @returns {Promise<Commit[]>}
 */
async function getCommits(range, one = false) {
    const list = [];
    const args = ["log", "--first-parent", "--format=%H%x00%s%x00%cd", "--date=local"];
    if (one) args.push("-1");
    args.push(range);

    const { stdout } = await execa("git", args, { cwd: checkout });
    for (let line of stdout.trim().split("\n")) {
        line = line.trim();
        if (!line) continue;
        const [hash, subject, date] = line.split("\x00");
        if (!hash || !subject || !date) continue;
        list.push({ hash, subject, date });
    }
    return list;
}

/**
 * @param {Commit} commit
 */
function prettyCommit(commit) {
    return `${commit.hash} ${commit.subject} at ${commit.date}`;
}

let seen;
try {
    seen = new Set(
        readFileSync(seenFilename, { encoding: "utf-8" })
            .trim()
            .split(/\r?\n/g)
            .map(v => v.trim()),
    );
}
catch {
    seen = new Set();
}

console.log(`Starting backfill of ${branch} from ${startCommit}...`);

/** @type {ReturnType<ora> | undefined} */
let spinner;

/**
 * @param {string} message
 */
function updateSpinner(message) {
    if (spinner === undefined) {
        spinner = ora(message).start();
    }
    else {
        spinner.text = message;
    }
}

function stopSpinner() {
    if (spinner !== undefined) {
        spinner.stop();
        spinner = undefined;
    }
}

let skipped = 0;
for (let i = 0;; i++) {
    const queryString = `${startCommit}~${i}`;
    const [commit] = await getCommits(queryString, true);
    assert(commit);

    if (seen.has(commit.hash)) {
        skipped++;
        continue;
    }

    if (skipped) {
        stopSpinner();
        console.log(`Skipped ${skipped} commits.`);
        skipped = 0;
    }

    while (true) {
        const count = await getPendingBuildCount();
        if (count === 0) {
            break;
        }
        updateSpinner(`Waiting for ${count} pending ${count === 1 ? "build" : "builds"} to finish...`);
        await sleepSeconds(5 * 60);
    }

    stopSpinner();

    console.log(`Queueing ${prettyCommit(commit)}`);
    await runPipeline(pipeline, {
        resources: {
            repositories: {
                TypeScript: {
                    refName: `refs/heads/${branch}`,
                },
            },
        },
        templateParameters: {
            HISTORICAL_RUN: true,
        },
    });

    appendFileSync(seenFilename, `${commit.hash}\n`);
    seen.add(commit.hash);

    updateSpinner("Waiting for 1 pending build to finish...");

    // Delay a little the build has a chance to show up.
    await sleepSeconds(60);
}
