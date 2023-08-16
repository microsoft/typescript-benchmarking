import assert from "assert";
import { $ as _$ } from "execa";
import fs from "fs";
import minimist from "minimist";
import path from "path";

import { RepoInfo } from "./utils.mjs";

const $ = _$({ verbose: true, stdio: "inherit" });

const [subcommand, ...rawArgs] = process.argv.slice(2);

const args = minimist(rawArgs, {
    string: ["builtDir", "save", "saveBlob", "baseline", "load", "baselineName", "benchmarkName", "format"],
    boolean: ["quiet"],
});

/** @type {<T extends {}>(x: T | undefined | null, message: string) => T} */
function checkNonEmpty(x, message) {
    assert(x, message);
    return x;
}

/**
 * @param {string} name
 */
function getNonEmptyEnv(name) {
    const value = process.env[name];
    assert(value, `Expected ${name} environment variable to be set`);
    return value;
}

const tsperfExe = checkNonEmpty(process.env.TSPERF_EXE, "Expected TSPERF_EXE environment variable to be set");

/** @type {Record<string, (() => Promise<void>) | undefined>} */
const commands = {
    "install-hosts": installHosts,
    "benchmark-tsc": benchmarkTsc,
    "benchmark-tsserver": benchmarkTsserver,
    "benchmark-startup": benchmarkStartup,
};

const fn = commands[subcommand];
assert(fn, `Unknown subcommand ${subcommand}`);

await fn();

/**
 * @returns {Promise<RepoInfo>}
 */
async function getRepoInfo() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");
    const repoInfoPath = path.join(builtDir, "info.json");
    const parsed = JSON.parse(await fs.promises.readFile(repoInfoPath, { encoding: "utf8" }));
    return RepoInfo.parse(parsed);
}

/**
 * @param {string} ref
 * @param {string} commit
 */
async function isLatestCommitForRef(ref, commit) {
    assert(ref.startsWith("refs/"));
    ref = ref.slice("refs/".length);
    const auth = getNonEmptyEnv("GH_TOKEN");
    const { Octokit } = await import("@octokit/rest");
    const gh = new Octokit({ auth });
    const latest = await gh.git.getRef({ owner: "microsoft", repo: "typescript", ref });
    const isLatest = latest.data.object.sha === commit;
    console.log(`Latest commit for ${ref} is: ${latest.data.object.sha}`);
    console.log(`This run was for: ${commit}`);
    if (isLatest) {
        console.log("This is the latest commit for this ref.");
    }
    return isLatest;
}

/**
 * @param {string} name
 * @param {(string | undefined)[]} hostVars
 * @returns {string[]}
 */
function createFlags(name, hostVars) {
    const hosts = new Set();
    for (const arg of hostVars) {
        for (const host of arg?.split(",") ?? []) {
            hosts.add(host);
        }
    }

    const args = [];
    for (const host of hosts) {
        args.push(`--${name}`);
        args.push(host);
    }

    return args;
}

async function installHosts() {
    const hostArgs = createFlags(
        "host",
        [
            process.env.TSPERF_TSC_HOSTS,
            process.env.TSPERF_TSSERVER_HOSTS,
            process.env.TSPERF_STARTUP_HOSTS,
        ],
    );

    await $`node ${tsperfExe} host install ${hostArgs}`;
}

/**
 * @param {string} hostsEnvVarName
 * @param {string} scenariosEnvVarName
 * @param {string} iterationsEnvVarName
 */
async function getCommonBenchmarkArgs(
    hostsEnvVarName,
    scenariosEnvVarName,
    iterationsEnvVarName,
) {
    const tsperfArgs = [];

    if (args.save) {
        await $`mkdir -p ${path.dirname(args.save)}`;
        tsperfArgs.push("--save", args.save);

        const hosts = getNonEmptyEnv(hostsEnvVarName);
        const scenarios = getNonEmptyEnv(scenariosEnvVarName);
        const iterations = getNonEmptyEnv(iterationsEnvVarName);
        const cpu = getNonEmptyEnv("TSPERF_AGENT_BENCHMARK_CPU");
        const info = await getRepoInfo();

        tsperfArgs.push(...createFlags("host", [hosts]));
        tsperfArgs.push(...createFlags("scenario", [scenarios]));
        tsperfArgs.push("--iterations", iterations);
        tsperfArgs.push("--cpus", cpu);

        tsperfArgs.push("--date", info.date);
        tsperfArgs.push("--repositoryType", "git");
        tsperfArgs.push("--repositoryUrl", "https://github.com/microsoft/TypeScript");
        tsperfArgs.push("--repositoryBranch", info.branch);
        tsperfArgs.push("--repositoryCommit", info.commit);
        tsperfArgs.push("--repositoryDate", info.date);
    }
    else {
        if (args.saveBlob) {
            const info = await getRepoInfo();

            // ts-perf accepts this as an env var, just check that it exists for an early error.
            getNonEmptyEnv("TSPERF_AZURE_STORAGE_CONNECTION_STRING");
            tsperfArgs.push(
                "--save",
                `blob:${info.branch}/${info.timestampDir}/${info.commitShort}.${args.saveBlob}.benchmark`,
            );

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
            const latest = await isLatestCommitForRef(ref, info.commit);
            if (latest) {
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

    return tsperfArgs;
}

async function benchmarkTsc() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");
    const tscPath = path.join(builtDir, "tsc.js");

    const tsperfArgs = await getCommonBenchmarkArgs(
        "TSPERF_TSC_HOSTS",
        "TSPERF_TSC_SCENARIOS",
        "TSPERF_TSC_ITERATIONS",
    );

    await $`node ${tsperfExe} benchmark tsc --tsc ${tscPath} ${tsperfArgs}`;
}

async function benchmarkTsserver() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");
    const tsserverPath = path.join(builtDir, "tsserver.js");

    const tsperfArgs = await getCommonBenchmarkArgs(
        "TSPERF_TSSERVER_HOSTS",
        "TSPERF_TSSERVER_SCENARIOS",
        "TSPERF_TSSERVER_ITERATIONS",
    );

    await $`node ${tsperfExe} benchmark tsserver --tsserver ${tsserverPath} ${tsperfArgs}`;
}

async function benchmarkStartup() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");

    const tsperfArgs = await getCommonBenchmarkArgs(
        "TSPERF_STARTUP_HOSTS",
        "TSPERF_STARTUP_SCENARIOS",
        "TSPERF_STARTUP_ITERATIONS",
    );

    await $`node ${tsperfExe} benchmark startup --builtDir ${builtDir} ${tsperfArgs}`;
}
