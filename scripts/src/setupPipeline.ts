import assert from "node:assert";

import esMain from "es-main";
import prettyMilliseconds from "pretty-ms";
import sortKeys from "sort-keys";

import { setOutputVariable } from "./utils.js";

// Keep in sync with inventory.yml and benchmark.yml.
const allAgents = [
    "ts-perf1",
    "ts-perf2",
    "ts-perf3",
    "ts-perf4",
    "ts-perf5",
    "ts-perf6",
    "ts-perf7",
    "ts-perf8",
    "ts-perf9",
    "ts-perf10",
    "ts-perf11",
    "ts-perf12",
] as const;
type AllAgents = typeof allAgents[number];
// We reserve some agents so that non-baseline jobs can make progress.
const reserveAgents = [
    "ts-perf4",
    "ts-perf5",
    "ts-perf6",
    "ts-perf7",
    "ts-perf8",
    "ts-perf9",
    "ts-perf10",
    "ts-perf11",
    "ts-perf12",
] as const;
type ReserveAgents = typeof reserveAgents[number];
type BaselineAgent = Exclude<AllAgents, ReserveAgents>;
type Agent = "any" | AllAgents;

type ScenarioLocation = "internal" | "public";

const defaultIterations = 6;

// TODO(jakebailey): have unpinned variants; ts-perf mostly supports @latest.
const hosts = {
    // This version is arbitrary (just what was latest on 2023-08-12).
    node20: "node@20.5.1",
    // This matches a recent VS Code version via Electron.
    node18: "node@18.15.0",
    bun: "bun@1.0.35",
    vscode: "vscode@1.82.1",
} as const satisfies Record<string, string>;

type HostName = typeof hosts[keyof typeof hosts];

const allJobKinds = ["tsc", "tsserver", "startup"] as const;
type JobKind = typeof allJobKinds[number];

const enum RunType {
    None = 0,
    Any = -1,
    Baseline = 1 << 0,
    OnDemand = 1 << 1,
}

interface BaseScenario {
    readonly kind: JobKind;
    readonly name: string;
    readonly agent: BaselineAgent;
    readonly location: ScenarioLocation;
    readonly runIn: RunType;
    /**
     * Rough time cost per iteration in seconds.
     * This is solely used for gauging how expensive a preset is.
     * Pull this from the logs, i.e from "compiled scenario ... in XYZs".
     */
    readonly cost: number;
}

// DO NOT change the agents; they must remain the same forever to keep benchmarks comparable.
const allScenarios: readonly BaseScenario[] = [
    { kind: "tsc", name: "Angular", agent: "ts-perf1", location: "internal", runIn: RunType.Any, cost: 22 },
    { kind: "tsc", name: "Monaco", agent: "ts-perf2", location: "internal", runIn: RunType.Any, cost: 17 },
    { kind: "tsc", name: "TFS", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 15 },
    { kind: "tsc", name: "material-ui", agent: "ts-perf1", location: "internal", runIn: RunType.Any, cost: 25 },
    { kind: "tsc", name: "Compiler-Unions", agent: "ts-perf2", location: "public", runIn: RunType.Any, cost: 17 },
    { kind: "tsc", name: "xstate", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 9 },
    { kind: "tsc", name: "vscode", agent: "ts-perf3", location: "public", runIn: RunType.Any, cost: 107 },
    { kind: "tsc", name: "self-compiler", agent: "ts-perf1", location: "public", runIn: RunType.Any, cost: 25 },
    { kind: "tsc", name: "self-build-src", agent: "ts-perf2", location: "public", runIn: RunType.Any, cost: 51 },
    {
        kind: "tsc",
        name: "self-build-src-public-api",
        agent: "ts-perf1",
        location: "public",
        runIn: RunType.Any,
        cost: 51,
    },
    { kind: "tsc", name: "mui-docs", agent: "ts-perf2", location: "public", runIn: RunType.OnDemand, cost: 77 },
    { kind: "tsc", name: "mui-docs-1", agent: "ts-perf2", location: "public", runIn: RunType.Baseline, cost: 77 },
    { kind: "tsc", name: "webpack", agent: "ts-perf3", location: "public", runIn: RunType.OnDemand, cost: 22 },
    { kind: "tsc", name: "webpack-1", agent: "ts-perf3", location: "public", runIn: RunType.Baseline, cost: 22 },
    {
        kind: "tsserver",
        name: "Compiler-UnionsTSServer",
        agent: "ts-perf1",
        location: "public",
        runIn: RunType.Any,
        cost: 18,
    },
    {
        kind: "tsserver",
        name: "CompilerTSServer",
        agent: "ts-perf2",
        location: "public",
        runIn: RunType.Any,
        cost: 17,
    },
    { kind: "tsserver", name: "xstateTSServer", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 14 },
    { kind: "startup", name: "tsc-startup", agent: "ts-perf1", location: "public", runIn: RunType.Any, cost: 19 },
    {
        kind: "startup",
        name: "tsserver-startup",
        agent: "ts-perf2",
        location: "public",
        runIn: RunType.Any,
        cost: 28,
    },
    {
        kind: "startup",
        name: "tsserverlibrary-startup",
        agent: "ts-perf3",
        location: "public",
        runIn: RunType.Any,
        cost: 28,
    },
    {
        kind: "startup",
        name: "typescript-startup",
        agent: "ts-perf1",
        location: "public",
        runIn: RunType.Any,
        cost: 28,
    },
];

type ScenarioName = typeof allScenarios[number]["name"];

interface Scenario extends BaseScenario {
    readonly name: ScenarioName;
    readonly host: HostName;
    readonly iterations: number;
}

const baselineScenarios = allScenarios.filter(scenario => scenario.runIn & RunType.Baseline);
const onDemandScenarios = allScenarios.filter(scenario => scenario.runIn & RunType.OnDemand);

function* generateBaselinePreset(scenarios: readonly BaseScenario[]): Iterable<Scenario> {
    for (const scenario of scenarios) {
        if (scenario.kind === "tsc") {
            for (const host of [hosts.node20, hosts.node18]) {
                yield {
                    ...scenario,
                    host,
                    iterations: defaultIterations,
                };
            }
        }
        else {
            yield {
                ...scenario,
                host: hosts.node18,
                iterations: defaultIterations,
            };
        }
    }
}

// Note: keep this up to date with TSPERF_PRESET
const presets = {
    "baseline": () => generateBaselinePreset(baselineScenarios),
    "full": () => generateBaselinePreset(onDemandScenarios),
    *"regular"() {
        // The bot trigger will default to "regular" when
        for (const scenario of onDemandScenarios) {
            yield {
                ...scenario,
                host: hosts.node18,
                iterations: defaultIterations,
            };
        }
    },
    *"tsc-only"() {
        for (const scenario of onDemandScenarios) {
            if (scenario.kind === "tsc") {
                yield {
                    ...scenario,
                    host: hosts.node18,
                    iterations: defaultIterations,
                };
            }
        }
    },
    "faster": (): Iterable<Scenario> => presets["tsc-only"](),
    *"bun"() {
        for (const scenario of onDemandScenarios) {
            if (scenario.kind === "tsc") {
                yield {
                    ...scenario,
                    host: hosts.bun,
                    iterations: defaultIterations * 2,
                };
            }
            else if (scenario.kind === "startup" && scenario.name !== "tsserver-startup") {
                yield {
                    ...scenario,
                    host: hosts.bun,
                    iterations: defaultIterations,
                };
            }
        }
    },
    *"vscode"() {
        for (const scenario of onDemandScenarios) {
            yield {
                ...scenario,
                host: hosts.vscode,
                iterations: defaultIterations,
            };
        }
    },
    *"public"() {
        for (const scenario of onDemandScenarios) {
            if (scenario.kind === "tsc" && scenario.location === "public") {
                yield {
                    ...scenario,
                    host: hosts.node20,
                    iterations: defaultIterations,
                };
            }
        }
    },
} satisfies Record<string, () => Iterable<Scenario>>;

type PresetName = keyof typeof presets;

function isPresetName(name: string): name is PresetName {
    return name in presets;
}

export const allPresetNames: ReadonlySet<string> = new Set(Object.keys(presets));

type JobName = string & { __sanitizedJobName: never; };

function sanitizeJobName(name: string): JobName {
    return name.replace(/[^a-zA-Z0-9_]/g, "_") as JobName;
}

// This defines the sort order, which is seen in PR replies; tsc is the most important and should be first.
const kindOrder: readonly JobKind[] = ["tsc", "tsserver", "startup"];

assert.deepStrictEqual([...allJobKinds].sort(), [...kindOrder].sort(), "kindOrder must contain all job kinds");

interface Job {
    TSPERF_JOB_KIND: JobKind;
    TSPERF_JOB_NAME: JobName;
    TSPERF_JOB_HOST: HostName;
    TSPERF_JOB_SCENARIO: ScenarioName;
    TSPERF_JOB_ITERATIONS: number;
    TSPERF_JOB_LOCATION: ScenarioLocation;
}

type Matrix = {
    [key in Agent]: {
        [name: JobName]: Job;
    };
};

function prettySeconds(seconds: number) {
    return prettyMilliseconds(seconds * 1000);
}

interface Parameters {
    preset: PresetName;
    predictable: boolean | undefined;
    hosts: string[] | undefined;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toUpperCase() === "TRUE";
}

function parseInput(input: string, isPr: boolean) {
    const parsed: Parameters = {
        preset: isPr ? "regular" : "baseline",
        predictable: undefined,
        hosts: undefined,
    };

    let parsedPresetName = false;

    for (const part of input.trim().split(/\s+/)) {
        if (!parsedPresetName) {
            parsedPresetName = true;
            if (isPresetName(part)) {
                parsed.preset = part;
                continue;
            }
        }

        // Parse "key" or "key=value".
        const [key, value] = part.split("=", 2) as [string, string | undefined];

        switch (key) {
            case "predictable":
                parsed.predictable = parseBoolean(value, true);
                break;
            case "host":
            case "hosts":
                if (!value) {
                    throw new Error(`Expected value for ${key}`);
                }
                (parsed.hosts ??= []).push(...value.split(","));
                break;
        }
    }

    return parsed;
}

export interface SetupPipelineInput {
    input: string;
    baselining: boolean;
    isPr: boolean;
    shouldLog: boolean;
}

export function setupPipeline({ input, baselining, isPr, shouldLog }: SetupPipelineInput) {
    const parameters = parseInput(input, isPr);
    if (shouldLog) {
        console.log("Parameters", parameters);
    }

    // TODO(jakebailey): use parameters

    const preset = presets[parameters.preset];

    let matrix: Matrix = {
        "any": {},
        "ts-perf1": {},
        "ts-perf2": {},
        "ts-perf3": {},
        "ts-perf4": {},
        "ts-perf5": {},
        "ts-perf6": {},
        "ts-perf7": {},
        "ts-perf8": {},
        "ts-perf9": {},
        "ts-perf10": {},
        "ts-perf11": {},
        "ts-perf12": {},
    };

    const processKinds = new Set<JobKind>();
    const processLocations = new Set<ScenarioLocation>();

    const jobOverhead = 40; // Time taken per benchmark job to clone, build, etc
    let totalCost = 0;
    let maxCost = 0;
    const costPerAgent = new Map<Agent, number>();

    for (const scenario of preset()) {
        const agent = baselining ? scenario.agent : "any";
        const jobName = sanitizeJobName(`${scenario.kind}_${scenario.host}_${scenario.name}`);
        matrix[agent][jobName] = {
            TSPERF_JOB_KIND: scenario.kind,
            TSPERF_JOB_NAME: jobName,
            TSPERF_JOB_HOST: scenario.host,
            TSPERF_JOB_SCENARIO: scenario.name,
            TSPERF_JOB_ITERATIONS: scenario.iterations,
            TSPERF_JOB_LOCATION: scenario.location,
        };
        processKinds.add(scenario.kind);
        processLocations.add(scenario.location);

        let cost = scenario.cost * scenario.iterations + jobOverhead;
        if (!baselining) {
            cost *= 2;
        }
        totalCost += cost;
        maxCost = Math.max(maxCost, cost);
        costPerAgent.set(agent, (costPerAgent.get(agent) ?? 0) + cost);
    }

    matrix = sortKeys(matrix, { deep: true });

    const outputVariables: Record<string, string> = {};

    for (const [agent, value] of Object.entries(matrix)) {
        const sanitizedAgent = agent.replace(/-/g, "_");
        outputVariables[`MATRIX_${sanitizedAgent}`] = JSON.stringify(value);
        if (shouldLog) {
            console.log(sanitizedAgent, JSON.stringify(value, undefined, 4));
        }
    }

    // These are outputs for the ProcessResults job, specifying which results were
    // produced previously and need to be processed. This is a space separated list,
    // iterated in the pipeline in bash.
    outputVariables[`TSPERF_PROCESS_KINDS`] = kindOrder.filter(kind => processKinds.has(kind)).join(" ");
    // Comma separated, parsed by runTsPerf.ts.
    outputVariables[`TSPERF_PROCESS_LOCATIONS`] = [...processLocations].sort().join(",");

    // If baselining, the cost is determined by the longest job on any given agent.
    // Otherwise, it's either the longest single job, or a rough estimate of the total time
    // spread over multiple agents (i.e. when there are more jobs than agents to run them).q
    const costInParallel = baselining ? Math.max(...costPerAgent.values())
        : Math.max(maxCost, Math.ceil(totalCost / allAgents.length));
    const perAgent = Object.fromEntries(
        [...costPerAgent.entries()].map(([agent, cost]) => [agent, prettySeconds(cost)]),
    );

    return {
        matrix,
        outputVariables,
        compute: {
            total: prettySeconds(totalCost),
            parallel: prettySeconds(costInParallel),
            perAgent,
        },
        parameters,
    };
}

if (esMain(import.meta)) {
    const input = process.env.TSPERF_INPUT;
    assert(input, "TSPERF_INPUT must be set");
    const baselining = parseBoolean(process.env.USE_BASELINE_MACHINE, false);
    const isPr = parseBoolean(process.env.IS_PR, false);

    const { outputVariables } = setupPipeline({
        input,
        baselining,
        isPr,
        shouldLog: true,
    });
    for (const [key, value] of Object.entries(outputVariables)) {
        setOutputVariable(key, value);
    }
}
