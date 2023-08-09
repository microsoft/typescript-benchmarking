import assert from "assert";
import { $ as _$ } from "execa";
import fs from "fs";
import minimist from "minimist";
import path from "path";

const $ = _$({ verbose: true, stdio: "inherit" });

const [subcommand, ...rawArgs] = process.argv.slice(2);

const args = minimist(rawArgs, {
    string: ["builtDir", "save", "baseline", "load", "baselineName", "benchmarkName", "format"],
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
 * @returns {Promise<Record<string, string>>}
 */
async function getRepoInfo() {
    const builtDir = checkNonEmpty(args.builtDir, "Expected non-empty --builtDir");
    const repoInfoPath = path.join(builtDir, "info.json");
    return JSON.parse(await fs.promises.readFile(repoInfoPath, { encoding: "utf8" }));
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
        tsperfArgs.push("--save", args.save);

        await $`mkdir -p ${path.dirname(args.save)}`;

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
        // tsperfArgs.push("--repositoryUrl", ""); // TODO: needed?
        // tsperfArgs.push("--repositoryBranch", ""); // TODO: figure out how to get this accurately
        tsperfArgs.push("--repositoryCommit", info.commit);
        tsperfArgs.push("--repositoryDate", info.date);
    }
    else {
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
