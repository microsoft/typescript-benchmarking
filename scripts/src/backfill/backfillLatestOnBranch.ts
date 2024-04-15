/**
 * This script backfills the latest commit on each provided branch.
 */

import assert from "node:assert";

import dotenv from "dotenv";
import minimist from "minimist";

import { runPipeline } from "./common.js";

dotenv.config();

const args = minimist(process.argv.slice(2), {
    string: ["pipeline"],
    default: {
        pipeline: 69,
    },
});

const pipeline = args.pipeline;
assert(pipeline, "Must provide --pipeline");

for (const branch of args._) {
    const refName = `refs/heads/${branch}`;
    console.log(`Queueing backfill for ${branch}`);

    await runPipeline(pipeline, {
        resources: {
            repositories: {
                TypeScript: {
                    refName,
                },
            },
        },
        templateParameters: {
            HISTORICAL_RUN: "true",
        },
    });
}
