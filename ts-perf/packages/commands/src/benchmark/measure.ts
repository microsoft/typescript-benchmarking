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
    computeMetrics,
    ExpansionProvider,
    formatProgress,
    formatScenarioAndTestHost,
    formatTestHost,
    Host,
    HostSpecifier,
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

export async function measureAndRunScenarios({ kind, options }: TSOptions, host: HostContext): Promise<Benchmark> {
    const date = (options.date ? new Date(options.date) : new Date()).toISOString();
    const system = SystemInfo.getCurrent();
    const repository = Repository.tryDiscover(
        kind === "tsc" ? path.dirname(options.tsc)
            : kind === "tsserver" ? path.dirname(options.tsserver) : options.builtDir,
        options.repositoryType,
        options.repositoryUrl,
        options.repositoryBranch,
        options.repositoryCommit,
        options.repositoryDate,
        options.repositoryCommitSubject,
    );
    const scenarios = await Scenario.findScenarios(options.scenarioConfigDirs, options.scenarios, kind);
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
    const temp = await getTempDirectories();
    const expansion = ExpansionProvider.getProviders({ runner: { kind: "tsc", options }, temp, scenario, host });
    const { cmd, args, hasBuild } = new CommandLineArgumentsBuilder(
        expansion,
        host,
        /*exposeGc*/ undefined,
        options.cpus,
        options.predictable,
    )
        .add(options.tsc)
        .addCompilerOptions(options, scenario)
        .add("--diagnostics");
    const { cmd: clean, args: cleanargs } = new CommandLineArgumentsBuilder(expansion, host)
        .add(options.tsc)
        .addCompilerOptions(options, scenario)
        .add("--clean");
    try {
        await fs.promises.mkdir(temp.suiteTempDirectory);
    }
    catch {}

    context.trace(`> ${cmd} ${args.join(" ")}`);

    const samples: CompilerSample[] = [];
    const numIterations = options.iterations || 5;
    for (let i = 0; i < numIterations + 1; i++) {
        const isWarmup = i === 0;
        const values: { [key: string]: number; } = Object.create(null);
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
                const m = diagnosticPattern.exec(line);
                if (m) values[m[1].trim()] = (values[m[1].trim()] ?? 0) + +m[2].trim();
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
            `    ${formatProgress(i, numIterations)} Compiled scenario '${name}'${status ? " (with errors)" : ""} in ${
                values["Total time"]
            }s.`,
        );

        try {
            await fs.promises.rm(temp.outDirectory, { recursive: true });
        }
        catch {}

        if (!isWarmup && values["Total time"]) {
            samples.push({
                project: name,
                parseTime: +values["Parse time"],
                bindTime: +values["Bind time"],
                checkTime: +values["Check time"],
                emitTime: +values["Emit time"],
                totalTime: +values["Total time"],
                memoryUsed: +values["Memory used"],
            });
        }
    }

    const metrics: Record<string, Value | undefined> = {};
    addMetric(metrics, "parseTime", samples.map(x => x.parseTime), "Parse Time", "s", 2);
    addMetric(metrics, "bindTime", samples.map(x => x.bindTime), "Bind Time", "s", 2);
    addMetric(metrics, "checkTime", samples.map(x => x.checkTime), "Check Time", "s", 2);
    addMetric(metrics, "emitTime", samples.map(x => x.emitTime), "Emit Time", "s", 2);
    addMetric(metrics, "totalTime", samples.map(x => x.totalTime), "Total Time", "s", 2);
    addMetric(metrics, "memoryUsed", samples.map(x => x.memoryUsed), "Memory used", "k", 0);

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
    const temp = await getTempDirectories();
    const expansion = ExpansionProvider.getProviders({ runner: { kind: "tsserver", options }, temp, scenario, host });
    const argsBuilder = new CommandLineArgumentsBuilder(expansion, host, /*exposeGc*/ false)
        .add(path.join(__dirname, "measuretsserver.js"))
        .add("--tsserver", options.tsserver)
        .add("--commands", scenario.configFile)
        .add("--suite", options.suite);
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
    for (let i = 0; i < numIterations + 1; i++) {
        const isWarmup = i === 0;
        const values: { [key: string]: number; } = Object.create(null);
        const runAndParseOutput = () => {
            const childProcess = spawn(cmd!, args);

            readline.createInterface({ input: childProcess.stdout, terminal: false }).on("line", line => {
                context.trace(`> ${line}`);
                const m = diagnosticPattern.exec(line);
                if (m) {
                    values[m[1].trim()] = (values[m[1].trim()] ?? 0) + +m[2].trim();
                    valueKeys.add(m[1].trim());
                }
            });

            readline.createInterface({ input: childProcess.stderr, terminal: false }).on("line", line => {
                context.error(`>> ${line}`);
            });

            return new Promise<number>(resolve => childProcess.once("exit", resolve));
        };
        const status = await runAndParseOutput();

        context.info(
            `    ${formatProgress(i, numIterations)} Ran scenario '${name}'${status ? " (with errors)" : ""}.`,
        );

        try {
            await fs.promises.rm(temp.outDirectory, { recursive: true });
        }
        catch {}

        if (!isWarmup) {
            samples.push(values);
        }
    }

    const metrics: { [key: string]: Value | undefined; } = Object.create(null);
    valueKeys.forEach(metricName => {
        const isCount = metricName.includes("count");
        addMetric(metrics, metricName, samples.map(x => x[metricName]), metricName, isCount ? "" : "ms", 0);
    });

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
    for (let i = 0; i < numIterations + 1; i++) {
        const isWarmup = i === 0;
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
            `    ${formatProgress(i, numIterations)} Completed ${scale} iterations${
                exitCode ? " (with errors)" : ""
            } in ${((afterAll - beforeAll) / 1000).toFixed(2)}s.`,
        );
    }

    const metrics: Record<string, Value | undefined> = {};
    addMetric(metrics, "executionTime", samples.map(x => x.executionTime), "Execution time", "ms", 2);

    return new Measurement(
        scenario.name,
        scenarioIndex,
        hostSpecifier,
        hostIndex,
        metrics,
    );
}

/**
 * Adds a metric to a metrics bag.
 */
function addMetric(
    metrics: Record<string, Value | undefined>,
    propName: string,
    samples: number[],
    metric: string,
    unit: string,
    precision: number,
) {
    metrics[propName] = computeMetrics(samples, metric, unit, precision);
}
