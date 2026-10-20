import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import esMain from "es-main";

import { isJobKind, JobKind } from "./setupPipeline.js";
import { getNonEmptyEnv, parseBoolean } from "./utils.js";

function resultPrefixes(isComparison: boolean) {
    return isComparison ? ["baseline", "new"] : ["baseline"];
}

// Messages are fixed because artifact names are untrusted and may contain logging commands.
async function assertNonEmptyFile(file: string, message: string) {
    const stat = await fs.promises.lstat(file).catch(() => undefined);
    assert(stat?.isFile() && stat.size > 0, message);
}

export interface ValidateBenchmarkArtifactsOptions {
    artifactsDir: string;
    jobName: string;
    jobKind: JobKind;
    isComparison: boolean;
}

export async function validateBenchmarkArtifacts(options: ValidateBenchmarkArtifactsOptions) {
    const expected = resultPrefixes(options.isComparison)
        .map(prefix => `${prefix}_${options.jobName}.${options.jobKind}.benchmark`);
    const stat = await fs.promises.lstat(options.artifactsDir).catch(() => undefined);
    assert(stat?.isDirectory(), "Unexpected benchmark artifact files");
    const actual = await fs.promises.readdir(options.artifactsDir);
    assert(
        actual.length === expected.length && expected.every(name => actual.includes(name)),
        "Unexpected benchmark artifact files",
    );
    for (const name of expected) {
        await assertNonEmptyFile(path.join(options.artifactsDir, name), "Missing or nonregular benchmark artifact");
    }
}

export interface ValidateProcessedResultsOptions {
    mergedDir: string;
    report: string;
    kinds: readonly JobKind[];
    isComparison: boolean;
}

export async function validateProcessedResults(options: ValidateProcessedResultsOptions) {
    assert(options.kinds.length > 0, "Expected processed benchmark kinds");
    for (const kind of options.kinds) {
        for (const prefix of resultPrefixes(options.isComparison)) {
            await assertNonEmptyFile(
                path.join(options.mergedDir, `${prefix}.${kind}.benchmark`),
                "Missing or nonregular merged benchmark result",
            );
        }
    }
    await assertNonEmptyFile(options.report, "Missing or nonregular benchmark report");
}

function getJobKind(value: string) {
    assert(isJobKind(value), "Unexpected benchmark kind");
    return value;
}

async function main() {
    const isComparison = parseBoolean(getNonEmptyEnv("TSPERF_IS_COMPARISON"), false);
    switch (process.argv[2]) {
        case "artifacts":
            await validateBenchmarkArtifacts({
                artifactsDir: getNonEmptyEnv("ARTIFACTS_DIR"),
                jobName: getNonEmptyEnv("TSPERF_JOB_NAME"),
                jobKind: getJobKind(getNonEmptyEnv("TSPERF_JOB_KIND")),
                isComparison,
            });
            break;
        case "processed":
            await validateProcessedResults({
                mergedDir: getNonEmptyEnv("MERGED_DIR"),
                report: path.join(getNonEmptyEnv("PIPELINE_WORKSPACE"), "comment.html"),
                kinds: getNonEmptyEnv("TSPERF_PROCESS_KINDS").split(/\s+/).map(getJobKind),
                isComparison,
            });
            break;
        default:
            throw new Error("Usage: validateBenchmarkResults.js artifacts|processed");
    }
}

if (esMain(import.meta)) {
    await main().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
