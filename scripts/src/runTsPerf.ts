import assert from "node:assert";
import path from "node:path";

import minimist from "minimist";

import { $, checkNonEmpty, getNonEmptyEnv, getRepoInfo, parseBoolean } from "./utils.js";

const [subcommand, ...rawArgs] = process.argv.slice(2);

const args = minimist(rawArgs, {
    string: ["builtDir", "save", "saveBlob", "baseline", "load", "baselineName", "benchmarkName", "format"],
    boolean: ["quiet"],
});

const tsperfExe = checkNonEmpty(process.env.TSPERF_EXE, "Expected TSPERF_EXE environment variable to be set");

const commands: Record<string, (() => Promise<void>) | undefined> = {
    "install-hosts": installHosts,
    "benchmark-tsc": benchmarkTsc,
    "benchmark-tsserver": benchmarkTsserver,
    "benchmark-startup": benchmarkStartup,
};

const fn = commands[subcommand];
assert(fn, `Unknown subcommand ${subcommand}`);

await fn();

async function installHosts() {
    const host = getNonEmptyEnv("TSPERF_JOB_HOST");

    await $`node ${tsperfExe} host install --host ${host}`;
}

function getLocationBasedArgs() {
    const locations = checkNonEmpty(
        process.env.TSPERF_JOB_LOCATION || process.env.TSPERF_PROCESS_LOCATIONS,
        "Expected TSPERF_JOB_LOCATION or TSPERF_PROCESS_LOCATIONS to be set",
    ).split(",");
    const tsperfArgs = [];

    for (const location of locations) {
        const locationUpper = location.toUpperCase();
        const scenarioConfigDir = getNonEmptyEnv(`TSPERF_${locationUpper}_SCENARIO_CONFIG_DIR`);
        tsperfArgs.push("--scenarioConfigDir", scenarioConfigDir);
        const suiteDir = getNonEmptyEnv(`TSPERF_${locationUpper}_SUITE_DIR`);
        tsperfArgs.push("--suite", suiteDir);
    }

    return tsperfArgs;
}

async function getCommonBenchmarkArgs() {
    const tsperfArgs = [];

    if (args.save) {
        await $`mkdir -p ${path.dirname(args.save)}`;
        tsperfArgs.push("--save", args.save);

        const host = getNonEmptyEnv("TSPERF_JOB_HOST");
        const scenario = getNonEmptyEnv("TSPERF_JOB_SCENARIO");
        const iterations = getNonEmptyEnv("TSPERF_JOB_ITERATIONS");
        const predictable = parseBoolean(getNonEmptyEnv("TSPERF_PREDICTABLE"), false);
        const cpu = getNonEmptyEnv("TSPERF_AGENT_BENCHMARK_CPU");
        const info = await getRepoInfo(args.builtDir);

        tsperfArgs.push("--host", host);
        tsperfArgs.push("--scenario", scenario);
        tsperfArgs.push("--iterations", iterations);
        tsperfArgs.push("--cpus", cpu);
        if (predictable) {
            tsperfArgs.push("--predictable");
        }

        tsperfArgs.push("--date", info.date);
        tsperfArgs.push("--repositoryType", "git");
        tsperfArgs.push("--repositoryUrl", "https://github.com/microsoft/TypeScript");
        if (info.branch) {
            tsperfArgs.push("--repositoryBranch", info.branch);
        }
        tsperfArgs.push("--repositoryCommit", info.commit);
        tsperfArgs.push("--repositoryDate", info.date);
    }
    else {
        if (args.saveBlob) {
            const info = await getRepoInfo(args.builtDir);
            assert(info.branch, "Expected branch to be set in repo info");

            // ts-perf accepts this as an env var, just check that it exists for an early error.
            getNonEmptyEnv("TSPERF_AZURE_STORAGE_CONNECTION_STRING");
            tsperfArgs.push(
                "--save",
                `blob:${info.branch}/${info.timestampDir}/${info.commitShort}.${args.saveBlob}.benchmark`,
            );

            const isLatest = getNonEmptyEnv("TSPERF_BLOB_LATEST").toUpperCase() === "TRUE";
            if (isLatest) {
                tsperfArgs.push(
                    "--save",
                    `blob:${info.branch}/latest.${args.saveBlob}.benchmark`,
                );
            }
        }

        if (args.baseline) {
            tsperfArgs.push("--baseline", args.baseline);
        }
        if (args.load) {
            tsperfArgs.push("--load", args.load);
        }
        if (args.baselineName) {
            tsperfArgs.push("--baselineName", args.baselineName);
        }
        if (args.benchmarkName) {
            tsperfArgs.push("--benchmarkName", args.benchmarkName);
        }
        if (args.format) {
            tsperfArgs.push("--format", args.format);
        }
        if (args.quiet) {
            tsperfArgs.push("--quiet");
        }
    }

    tsperfArgs.push(...getLocationBasedArgs());

    return tsperfArgs;
}

async function benchmarkTsc() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");

    const tsperfArgs = await getCommonBenchmarkArgs();

    await $`node ${tsperfExe} benchmark tsc --builtDir ${builtDir} ${tsperfArgs}`;
}

async function benchmarkTsserver() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");

    const tsperfArgs = await getCommonBenchmarkArgs();

    await $`node ${tsperfExe} benchmark tsserver --builtDir ${builtDir} ${tsperfArgs}`;
}

async function benchmarkStartup() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");

    const tsperfArgs = await getCommonBenchmarkArgs();

    await $`node ${tsperfExe} benchmark startup --builtDir ${builtDir} ${tsperfArgs}`;
}
