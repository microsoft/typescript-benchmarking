import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import * as readline from "node:readline";

import {
    Benchmark,
    CommandLineArgumentsBuilder,
    CompilerOptions,
    CompilerSample,
    compilerSampleKeys,
    computeMetrics,
    ExpansionProvider,
    formatProgress,
    formatScenarioAndTestHost,
    formatTestHost,
    getCompilerMetricName,
    getCompilerSampleKeyUnit,
    getCompilerSampleNameFromDiagnosticName,
    Host,
    HostSpecifier,
    isCompilerDiagnosticName,
    Measurement,
    Repository,
    Scenario,
    StartupOptions,
    StartupSample,
    TSServerOptions,
    TSServerSample,
    Value,
} from "@ts-perf/api";
import { getTempDirectories, HostContext, ProcessExitError, SystemInfo } from "@ts-perf/core";

import { BenchmarkOptions, TSOptions } from "./";

const diagnosticPattern = /^([a-z].+):\s+(.+?)[sk]?$/i;
// Explicitly loose regex so --pretty will work.
const errorPattern = /error.*TS\d+:/;

function tryParseDiagnostic(line: string) {
    if (errorPattern.test(line)) {
        return { name: "Errors", value: 1, precision: 0 };
    }
    const m = diagnosticPattern.exec(line);
    if (m) {
        const name = m[1].trim();
        const value = m[2].trim();
        const precision = (value.split(".")[1] || "").length;
        return { name, value: +value, precision };
    }
    return undefined;
}

export async function measureAndRunScenarios({ kind, options }: TSOptions, host: HostContext): Promise<Benchmark> {
    const date = (options.date ? new Date(options.date) : new Date()).toISOString();
    const system = SystemInfo.getCurrent();
    const repository = Repository.tryDiscover(
        options.builtDir,
        options.repositoryType,
        options.repositoryUrl,
        options.repositoryBranch,
        options.repositoryCommit,
        options.repositoryDate,
        options.repositoryCommitSubject,
    );
    const scenarios = await Scenario.findScenarios(options.scenarioDirs, options.scenarios, kind);
    if (scenarios.length === 0) {
        host.error(
            `abort: Could not find any scenario of kind '${kind}' ${
                options.scenarios ? `with name(s) ${options.scenarios.map(s => `'${s}'`).join(", ")}` : ""
            }.`,
        );
        throw new ProcessExitError(-1, "Scenario not found.");
    }
    const hosts = await Host.findHosts(options.hosts);
    host.info(`Scenarios: ${scenarios.map(x => x.name).join(", ")}`);
    host.info(`Hosts: ${hosts.map(x => formatTestHost(x)).join("; ")}`);
    const numHosts = hosts.length;
    const numScenarios = scenarios.length;
    const measurements: Measurement[] = [];
    for (let scenarioIndex = 0; scenarioIndex < numScenarios; scenarioIndex++) {
        const scenario = scenarios[scenarioIndex];
        for (let hostIndex = 0; hostIndex < numHosts; hostIndex++) {
            const testHost = hosts[hostIndex];
            const hostSpecifier = HostSpecifier.create(testHost);
            const name = formatScenarioAndTestHost(scenario, testHost);
            host.info(
                `  ${
                    formatProgress(scenarioIndex * numHosts + hostIndex, numHosts * numScenarios)
                } Measuring scenario '${name}'...`,
            );
            let measurement;
            switch (kind) {
                case "tsserver":
                    measurement = await runTSServerScenario(
                        name,
                        scenario,
                        testHost,
                        options,
                        host,
                        scenarioIndex,
                        hostSpecifier,
                        hostIndex,
                    );
                    break;
                case "tsc":
                    measurement = await runCompilerScenario(
                        name,
                        scenario,
                        testHost,
                        options,
                        host,
                        scenarioIndex,
                        hostSpecifier,
                        hostIndex,
                    );
                    break;
                case "startup":
                    measurement = await runStartupScenario(
                        name,
                        scenario,
                        testHost,
                        options,
                        host,
                        scenarioIndex,
                        hostSpecifier,
                        hostIndex,
                    );
                    break;
                default:
                    host.error(`Unrecognizable kind '${kind}'.`);
                    throw new ProcessExitError(-1, "Unrecognizable kind.");
            }
            measurements.push(measurement);
        }
    }
    return new Benchmark(
        date,
        system,
        repository,
        options.iterations || 5,
        scenarios,
        hosts,
        measurements,
        options.cpus,
        options.predictable,
    );
}

async function runCompilerScenario(
    name: string,
    scenario: Scenario,
    host: Host,
    options: BenchmarkOptions & CompilerOptions,
    context: HostContext,
    scenarioIndex: number,
    hostSpecifier: HostSpecifier,
    hostIndex: number,
): Promise<Measurement> {
    const tsc = path.join(options.builtDir, "tsc.js");
    const typescript = path.join(options.builtDir, "typescript.js");
    const tscPublicWrapper = path.join(__dirname, "tscpublic.js");
    const usesPublicApi = !!scenario.tscConfig?.usePublicApi;
    const temp = await getTempDirectories();
    const expansion = ExpansionProvider.getProviders({ runner: { kind: "tsc", options }, temp, scenario, host });
    const { cmd, args, hasBuild } = new CommandLineArgumentsBuilder(
        expansion,
        host,
        /*exposeGc*/ undefined,
        options.cpus,
        options.predictable,
    )
        .addIf(!usesPublicApi, tsc)
        .addIf(usesPublicApi, tscPublicWrapper, typescript)
        .addCompilerOptions(options, scenario)
        .add("--diagnostics");
    const { cmd: clean, args: cleanargs } = new CommandLineArgumentsBuilder(expansion, host)
        .add(tsc)
        .addCompilerOptions(options, scenario)
        .add("--clean");
    try {
        await fs.promises.mkdir(temp.suiteTempDirectory);
    }
    catch {}

    context.trace(`> ${cmd} ${args.join(" ")}`);

    const samples: CompilerSample[] = [];
    const precisions: { [K in keyof CompilerSample]?: number; } = Object.create(null);
    const numIterations = options.iterations || 5;
    const numWarmups = options.warmups || 0;
    const runs = numIterations + numWarmups;
    for (let i = 0; i < runs; i++) {
        const isWarmup = i < numWarmups;
        const values: CompilerSample = Object.create(null);
        if (hasBuild) {
            const cleanProcess = spawn(clean!, cleanargs);
            let cleanProcessOutput = "";
            cleanProcess.stdout.on("data", (d: string) => cleanProcessOutput += d.toString());
            cleanProcess.stderr.on("data", (d: string) => cleanProcessOutput += d.toString());
            const cleanErrors = await new Promise<number>(resolve => cleanProcess.once("exit", resolve));
            if (cleanErrors > 0) {
                throw new Error(`Got ${cleanErrors} errors from build clean:
    ${cleanProcessOutput}`);
            }
        }
        const compileAndParseDiagnostics = () => {
            const childProcess = spawn(cmd!, args);

            readline.createInterface({ input: childProcess.stdout, terminal: false }).on("line", line => {
                context.trace(`> ${line}`);
                const m = tryParseDiagnostic(line);
                if (m && isCompilerDiagnosticName(m.name)) {
                    const sampleName = getCompilerSampleNameFromDiagnosticName(m.name);
                    values[sampleName] = (values[sampleName] ?? 0) + m.value;
                    precisions[sampleName] = Math.max(precisions[sampleName] ?? 0, m.precision);
                }
            });

            readline.createInterface({ input: childProcess.stderr, terminal: false }).on("line", line => {
                context.error(`>> ${line}`);
            });

            return new Promise<number>(resolve => childProcess.once("exit", resolve));
        };
        let status = await compileAndParseDiagnostics();
        if (hasBuild) {
            status += await compileAndParseDiagnostics();
        }

        context.info(
            `    ${formatProgress(i, runs)} Compiled scenario '${name}'${
                status ? " (with errors)" : ""
            } in ${values.totalTime}s.${isWarmup ? " (warmup)" : ""}`,
        );

        try {
            await fs.promises.rm(temp.outDirectory, { recursive: true });
        }
        catch {}

        if (!isWarmup && values.totalTime) {
            samples.push(values);
        }
    }

    const metrics: Record<string, Value | undefined> = Object.create(null);
    for (const sampleName of compilerSampleKeys) {
        metrics[sampleName] = computeMetrics(
            samples.map(x => x[sampleName] ?? 0),
            getCompilerMetricName(sampleName),
            getCompilerSampleKeyUnit(sampleName),
            precisions[sampleName] ?? 0,
        );
    }

    return new Measurement(
        scenario.name,
        scenarioIndex,
        hostSpecifier,
        hostIndex,
        metrics,
    );
}

async function runTSServerScenario(
    name: string,
    scenario: Scenario,
    host: Host,
    options: BenchmarkOptions & TSServerOptions,
    context: HostContext,
    scenarioIndex: number,
    hostSpecifier: HostSpecifier,
    hostIndex: number,
): Promise<Measurement> {
    const tsserver = path.join(options.builtDir, "tsserver.js");
    const temp = await getTempDirectories();
    const expansion = ExpansionProvider.getProviders({ runner: { kind: "tsserver", options }, temp, scenario, host });
    const argsBuilder = new CommandLineArgumentsBuilder(expansion, host, /*exposeGc*/ false)
        .add(path.join(__dirname, "measuretsserver.js"))
        .add("--tsserver", tsserver)
        .add("--commands", scenario.configFile)
        .add("--suite", options.suiteDir);
    if (options.extended) {
        argsBuilder.add("--extended");
    }
    if (options.cpus) {
        argsBuilder.add("--cpus", options.cpus);
    }
    if (options.predictable) {
        argsBuilder.add("--predictable");
    }
    const { cmd, args } = argsBuilder;
    try {
        await fs.promises.mkdir(temp.suiteTempDirectory);
    }
    catch {}

    context.trace(`> ${cmd} ${args.join(" ")}`);

    const samples: TSServerSample[] = [];
    const valueKeys = new Set<string>();
    const numIterations = options.iterations || 5;
    const numWarmups = options.warmups || 0;
    const runs = numIterations + numWarmups;
    for (let i = 0; i < runs; i++) {
        const isWarmup = i < numWarmups;
        const before = performance.now();
        const values: { [key: string]: number; } = Object.create(null);
        const runAndParseOutput = () => {
            const childProcess = spawn(cmd!, args);

            readline.createInterface({ input: childProcess.stdout, terminal: false }).on("line", line => {
                context.trace(`> ${line}`);
                const m = tryParseDiagnostic(line);
                if (m) {
                    values[m.name] = (values[m.name] ?? 0) + m.value;
                    valueKeys.add(m.name);
                }
            });

            readline.createInterface({ input: childProcess.stderr, terminal: false }).on("line", line => {
                context.error(`>> ${line}`);
            });

            return new Promise<number>(resolve => childProcess.once("exit", resolve));
        };
        const status = await runAndParseOutput();
        const after = performance.now();

        context.info(
            `    ${formatProgress(i, runs)} Ran scenario '${name}'${status ? " (with errors)" : ""} in ${
                ((after - before) / 1000).toFixed(2)
            }s.${isWarmup ? " (warmup)" : ""}`,
        );

        try {
            await fs.promises.rm(temp.outDirectory, { recursive: true });
        }
        catch {}

        if (!isWarmup) {
            samples.push(values);
        }
    }

    const metrics: Record<string, Value | undefined> = Object.create(null);
    for (const metricName of valueKeys) {
        const isCount = metricName.includes("count");
        metrics[metricName] = computeMetrics(samples.map(x => x[metricName] ?? 0), metricName, isCount ? "" : "ms", 0);
    }

    return new Measurement(
        scenario.name,
        scenarioIndex,
        hostSpecifier,
        hostIndex,
        metrics,
    );
}

async function runStartupScenario(
    _name: string,
    scenario: Scenario,
    host: Host,
    options: BenchmarkOptions & StartupOptions,
    context: HostContext,
    scenarioIndex: number,
    hostSpecifier: HostSpecifier,
    hostIndex: number,
): Promise<Measurement> {
    if (!scenario.args || scenario.args.length < 1) {
        throw new Error("No args");
    }
    const temp = await getTempDirectories();
    const expansion = ExpansionProvider.getProviders({ runner: { kind: "startup", options }, temp, scenario, host });

    const entrypoint = scenario.args[0]; // A name of a JS file in the built/local directory.
    const argsBuilder = new CommandLineArgumentsBuilder(
        expansion,
        host,
        /*exposeGc*/ false,
        options.cpus,
        options.predictable,
    )
        .add(path.join(options.builtDir, entrypoint))
        .addRange(scenario.args.slice(1));

    const { cmd, args } = argsBuilder;

    context.trace(`> ${cmd} ${args.join(" ")}`);

    // The startup times are pretty quick; multiply the number of iterations by
    // a scaling factor in order to get statistically significant results.
    const scale = 100;
    function execute(): Promise<number | undefined> {
        // We can't use the tsserver harness here, as it is incompatible with --cpus;
        // instead, we do the same thing as the other processes, as closing stdin
        // is also a valid way to exit the server.
        const childProcess = spawn(cmd!, args, { stdio: "ignore" });
        return new Promise(resolve => childProcess.once("exit", code => resolve(code || undefined)));
    }

    const samples: StartupSample[] = [];
    const numIterations = options.iterations || 5;
    const numWarmups = options.warmups || 0;
    const runs = numIterations + numWarmups;
    for (let i = 0; i < runs; i++) {
        const isWarmup = i < numWarmups;
        let exitCode: number | undefined;

        const beforeAll = performance.now();
        for (let j = 0; j < scale; j++) {
            const before = performance.now();
            exitCode ??= await execute();
            const after = performance.now();

            if (!isWarmup) {
                samples.push({
                    executionTime: after - before,
                });
            }
        }
        const afterAll = performance.now();

        context.info(
            `    ${formatProgress(i, runs)} Completed ${scale} iterations${exitCode ? " (with errors)" : ""} in ${
                ((afterAll - beforeAll) / 1000).toFixed(2)
            }s.${isWarmup ? ` (warmup)` : ""}`,
        );
    }

    const metrics: Record<string, Value | undefined> = Object.create(null);
    metrics.executionTime = computeMetrics(samples.map(x => x.executionTime ?? 0), "Execution time", "ms", 2);

    return new Measurement(
        scenario.name,
        scenarioIndex,
        hostSpecifier,
        hostIndex,
        metrics,
    );
}
