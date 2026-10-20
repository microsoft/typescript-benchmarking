import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import esMain from "es-main";

import { allJobKinds, isJobKind, JobKind } from "./setupPipeline.js";
import { getNonEmptyEnv, parseBoolean } from "./utils.js";

export interface CollectBenchmarkResultsOptions {
    workspace: string;
    outputDir: string;
    isComparison: boolean;
    jobNamesByKind: Partial<Record<JobKind, readonly string[]>>;
}

export async function collectBenchmarkResults(options: CollectBenchmarkResultsOptions) {
    assert(Object.keys(options.jobNamesByKind).length > 0, "Expected scheduled benchmark jobs");
    await fs.promises.mkdir(options.outputDir, { recursive: true });

    for (const kind of allJobKinds) {
        const jobNames = options.jobNamesByKind[kind];
        if (!jobNames) {
            continue;
        }
        assert(jobNames.length > 0, `Expected scheduled ${kind} jobs`);
        for (const jobName of jobNames) {
            assert(
                /^[a-zA-Z0-9_]+$/.test(jobName) && jobName.startsWith(`${kind}_`),
                "Unexpected benchmark job name",
            );
            const artifactDir = path.join(options.workspace, `PartialBenchmark_${jobName}`);
            assert(
                (await fs.promises.lstat(artifactDir)).isDirectory(),
                "Expected a regular partial artifact directory",
            );
            for (const prefix of options.isComparison ? ["baseline", "new"] : ["baseline"]) {
                const filename = `${prefix}_${jobName}.${kind}.benchmark`;
                const source = path.join(artifactDir, filename);
                assert((await fs.promises.lstat(source)).isFile(), `Expected a regular benchmark result: ${filename}`);
                await fs.promises.copyFile(
                    source,
                    path.join(options.outputDir, filename),
                    fs.constants.COPYFILE_EXCL,
                );
                console.log(`Collected ${filename}`);
            }
        }
    }
}

async function main() {
    const jobNamesByKind: Partial<Record<JobKind, readonly string[]>> = {};
    for (const kind of getNonEmptyEnv("TSPERF_PROCESS_KINDS").split(/\s+/)) {
        assert(isJobKind(kind), "Unexpected benchmark process kind");
        jobNamesByKind[kind] = getNonEmptyEnv(`TSPERF_JOB_NAMES_${kind.toUpperCase()}`).split(/\s+/);
    }
    await collectBenchmarkResults({
        workspace: getNonEmptyEnv("PIPELINE_WORKSPACE"),
        outputDir: getNonEmptyEnv("BENCHMARKS_DIR"),
        isComparison: parseBoolean(getNonEmptyEnv("TSPERF_IS_COMPARISON"), false),
        jobNamesByKind,
    });
}

if (esMain(import.meta)) {
    await main().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
