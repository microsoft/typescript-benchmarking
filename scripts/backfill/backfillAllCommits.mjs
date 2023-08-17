/**
 * This script backfills all commits on a branch from a given starting commit.
 */

import assert from "assert";
import dotenv from "dotenv";
import { execa } from "execa";
import { appendFileSync, readFileSync } from "fs";
import minimist from "minimist";
import ora from "ora";

import { sleepSeconds } from "../utils.mjs";
import { getPendingBuildCount, runPipeline } from "./common.mjs";

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

try {
    await execa("git", ["merge-base", "--is-ancestor", startCommit, branch], { cwd: checkout });
}
catch {
    console.error(`Start commit ${startCommit} is not an ancestor of ${branch}`);
    process.exit(1);
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
        const count = await getPendingBuildCount(+args.pipeline);
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
                    version: commit.hash,
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
