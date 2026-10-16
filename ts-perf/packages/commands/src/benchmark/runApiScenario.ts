import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { performance } from "node:perf_hooks";
import * as readline from "node:readline";

import {
    apiTimingMetrics,
    apiTimingSampleKeys,
    CommandLineArgumentsBuilder,
    CompilerOptions,
    computeMetrics,
    ExpansionProvider,
    Host,
    HostSpecifier,
    Measurement,
    Scenario,
    Value,
} from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

import { BenchmarkOptions } from ".";
import { readApiTimingDumps } from "./apiTiming";

export function runApiProcess(
    command: string,
    args: string[],
    env = process.env,
    cwd?: string,
    context?: HostContext,
): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        readline.createInterface({ input: child.stdout }).on("line", line => {
            output += line + "\n";
            context?.trace(`> ${line}`);
        });
        readline.createInterface({ input: child.stderr }).on("line", line => {
            output += line + "\n";
            context?.error(`>> ${line}`);
        });
        child.once("error", reject);
        child.once("close", (code, signal) => {
            if (code !== 0) reject(new Error(`API consumer failed (${signal ?? code}):\n${output}`));
            else resolve();
        });
    });
}

export async function runApiScenario(
    scenario: Scenario,
    host: Host,
    options: BenchmarkOptions & CompilerOptions,
    context: HostContext,
    scenarioIndex: number,
    hostSpecifier: HostSpecifier,
    hostIndex: number,
): Promise<Measurement> {
    if (host.name !== "node" || !host.executableFile) {
        throw new Error("API benchmarks require an installed Node host, not the native host.");
    }
    if (!scenario.args?.length) throw new Error(`API scenario ${scenario.name} has no runner.`);
    const workDir = path.resolve(options.suiteDir, scenario.name);
    await fs.access(workDir).catch(error => {
        if (error.code !== "ENOENT") throw error;
        throw new Error(`Run ${path.join(scenario.configDirectory, "setup.sh")} before benchmarking.`);
    });
    const expansion = ExpansionProvider.getProviders({
        runner: {
            kind: "api",
            options: {
                ...options,
                builtDir: path.resolve(options.builtDir),
                suiteDir: path.resolve(options.suiteDir),
            },
        },
        scenario,
        host,
    });
    const run = new CommandLineArgumentsBuilder(expansion, host, false, options.cpus, options.predictable).add(
        path.resolve(scenario.configDirectory, expansion.expand(scenario.args[0])),
        ...scenario.args.slice(1),
    );
    const samples: number[] = [];
    const timingSamples: Awaited<ReturnType<typeof readApiTimingDumps>>[] = [];
    const iterations = options.iterations ?? 5;
    const warmups = options.warmups ?? 0;
    const timingDir = await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-api-"));
    try {
        for (let i = 0; i < iterations + warmups; i++) {
            const dumpDir = await fs.mkdtemp(path.join(timingDir, "timing-"));
            const before = performance.now();
            await runApiProcess(
                run.cmd!,
                run.args,
                {
                    ...process.env,
                    PATH: `${path.dirname(host.executableFile)}${path.delimiter}${process.env.PATH}`,
                    TS_API_TIMING_DIR: dumpDir,
                },
                workDir,
                context,
            );
            const elapsedMs = performance.now() - before;
            const timing = await readApiTimingDumps(dumpDir);
            context.info(`API ${scenario.name}: ${elapsedMs.toFixed(2)}ms${i < warmups ? " (warmup)" : ""}`);
            if (i >= warmups) {
                samples.push(elapsedMs / 1000);
                timingSamples.push(timing);
            }
        }
        const values: Partial<Record<string, Value>> = {
            totalTime: computeMetrics(samples, "Total time", "s", 4),
        };
        for (const key of apiTimingSampleKeys) {
            const definition = apiTimingMetrics[key];
            values[key] = computeMetrics(
                timingSamples.map(sample => sample[key]),
                definition.metric,
                definition.unit,
                definition.precision,
            );
        }
        return new Measurement(scenario.name, scenarioIndex, hostSpecifier, hostIndex, values);
    }
    finally {
        await fs.rm(timingDir, { recursive: true, force: true });
    }
}
