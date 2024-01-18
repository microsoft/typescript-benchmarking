import assert from "node:assert";

import esMain from "es-main";
import minimist from "minimist";
import prettyMilliseconds from "pretty-ms";
import sortKeys from "sort-keys";

import { setOutputVariable } from "./utils.js";

// Keep in sync with inventory.yml and benchmark.yml.
const allAgents = ["ts-perf1", "ts-perf2", "ts-perf3", "ts-perf4"] as const;
type AllAgents = typeof allAgents[number];
// We reserve some agents so that non-baseline jobs can make progress.
const reserveAgents = ["ts-perf4"] as const;
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
    node16: "node@16.17.1",
    bun: "bun@1.0.15",
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
     */
    readonly cost: number;
}

// DO NOT change the agents; they must remain the same forever to keep benchmarks comparable.
const allScenarios: readonly BaseScenario[] = [
    { kind: "tsc", name: "Angular", agent: "ts-perf1", location: "internal", runIn: RunType.Any, cost: 19 },
    { kind: "tsc", name: "Monaco", agent: "ts-perf2", location: "internal", runIn: RunType.Any, cost: 15 },
    { kind: "tsc", name: "TFS", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 13 },
    { kind: "tsc", name: "material-ui", agent: "ts-perf1", location: "internal", runIn: RunType.Any, cost: 20 },
    { kind: "tsc", name: "Compiler-Unions", agent: "ts-perf2", location: "internal", runIn: RunType.Any, cost: 14 },
    { kind: "tsc", name: "xstate", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 8 },
    { kind: "tsc", name: "vscode", agent: "ts-perf1", location: "public", runIn: RunType.Any, cost: 90 },
    { kind: "tsc", name: "self-compiler", agent: "ts-perf2", location: "public", runIn: RunType.Any, cost: 20 },
    { kind: "tsc", name: "self-build-src", agent: "ts-perf3", location: "public", runIn: RunType.Any, cost: 42 },
    { kind: "tsc", name: "mui-docs", agent: "ts-perf1", location: "public", runIn: RunType.OnDemand, cost: 62 },
    { kind: "tsc", name: "mui-docs-1", agent: "ts-perf1", location: "public", runIn: RunType.Baseline, cost: 62 },
    { kind: "tsc", name: "webpack", agent: "ts-perf3", location: "public", runIn: RunType.OnDemand, cost: 18 },
    { kind: "tsc", name: "webpack-1", agent: "ts-perf3", location: "public", runIn: RunType.Baseline, cost: 18 },
    {
        kind: "tsserver",
        name: "Compiler-UnionsTSServer",
        agent: "ts-perf1",
        location: "internal",
        runIn: RunType.Any,
        cost: 15,
    },
    {
        kind: "tsserver",
        name: "CompilerTSServer",
        agent: "ts-perf2",
        location: "internal",
        runIn: RunType.Any,
        cost: 14,
    },
    { kind: "tsserver", name: "xstateTSServer", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 12 },
    { kind: "startup", name: "tsc-startup", agent: "ts-perf1", location: "internal", runIn: RunType.Any, cost: 16 },
    {
        kind: "startup",
        name: "tsserver-startup",
        agent: "ts-perf2",
        location: "internal",
        runIn: RunType.Any,
        cost: 24,
    },
    {
        kind: "startup",
        name: "tsserverlibrary-startup",
        agent: "ts-perf3",
        location: "internal",
        runIn: RunType.Any,
        cost: 24,
    },
    {
        kind: "startup",
        name: "typescript-startup",
        agent: "ts-perf1",
        location: "internal",
        runIn: RunType.Any,
        cost: 24,
    },
];

type ScenarioName = typeof allScenarios[number]["name"];

interface Scenario extends BaseScenario {
    readonly name: ScenarioName;
    readonly host: HostName;
    readonly iterations: number;
}

// const baselineScenarios = allScenarios.filter(scenario => scenario.runIn & RunType.Baseline);
const onDemandScenarios = allScenarios.filter(scenario => scenario.runIn & RunType.OnDemand);

// TODO(jakebailey): unfilter internal; temporary
// const internalBaselineScenarios = baselineScenarios.filter(s => s.location === "internal");
const internalOnDemandScenarios = onDemandScenarios.filter(s => s.location === "internal");

function* generateBaselinePreset(scenarios: readonly BaseScenario[]): Iterable<Scenario> {
    for (const scenario of scenarios) {
        if (scenario.kind === "tsc") {
            // TODO(jakebailey): remove node16
            for (const host of [hosts.node20, hosts.node18, hosts.node16]) {
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
                host: hosts.node16, // TODO(jakebailey): use node18
                iterations: defaultIterations,
            };
        }
    }
}

// Note: keep this up to date with TSPERF_PRESET
const presets = {
    // "baseline": () => generateBaselinePreset(internalBaselineScenarios),
    "full": () => generateBaselinePreset(internalOnDemandScenarios),
    *"regular"() {
        // The bot trigger will default to "regular" when
        for (const scenario of internalOnDemandScenarios) {
            yield {
                ...scenario,
                host: hosts.node18,
                iterations: defaultIterations,
            };
        }
    },
    *"tsc-only"() {
        for (const scenario of internalOnDemandScenarios) {
            if (scenario.kind === "tsc") {
                yield {
                    ...scenario,
                    host: hosts.node18,
                    iterations: defaultIterations,
                };
            }
        }
    },
    // "faster": (): Iterable<Scenario> => presets["tsc-only"](),
    *"bun"() {
        for (const scenario of internalOnDemandScenarios) {
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
        for (const scenario of internalOnDemandScenarios) {
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

export function generateMatrix(presetArg: string, baselining: boolean, log?: boolean) {
    if (!isPresetName(presetArg)) {
        throw new Error(`Unknown preset: ${presetArg}`);
    }

    const preset = presets[presetArg];

    let matrix: Matrix = {
        "any": {},
        "ts-perf1": {},
        "ts-perf2": {},
        "ts-perf3": {},
        "ts-perf4": {},
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
        if (log) {
            console.log(sanitizedAgent, JSON.stringify(value, undefined, 4));
        }
    }

    // These are outputs for the ProcessResults job, specifying which results were
    // produced previously and need to be processed. This is a space separated list,
    // iterated in the pipeline in bash.
    outputVariables[`TSPERF_PROCESS_KINDS`] = kindOrder.filter(kind => processKinds.has(kind)).join(" ");
    // Comma separated, parsed by runTsPerf.ts.
    outputVariables[`TSPERF_PROCESS_LOCATIONS`] = [...processLocations].sort().join(",");

    const costInParallel = baselining ? Math.max(...costPerAgent.values()) : Math.ceil(totalCost / allAgents.length);

    return {
        matrix,
        outputVariables,
        compute: {
            total: prettyMilliseconds(totalCost * 1000),
            parallel: prettyMilliseconds(costInParallel * 1000),
        },
    };
}

if (esMain(import.meta)) {
    const args = minimist(process.argv.slice(2), {
        string: ["preset"],
    });

    const presetArg = args.preset;
    const baselining = (process.env.USE_BASELINE_MACHINE || "FALSE").toUpperCase() === "TRUE";

    const { outputVariables } = generateMatrix(presetArg, baselining, true);
    for (const [key, value] of Object.entries(outputVariables)) {
        setOutputVariable(key, value);
    }
}
