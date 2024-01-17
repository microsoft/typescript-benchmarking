import assert from "node:assert";

import esMain from "es-main";
import minimist from "minimist";
import sortKeys from "sort-keys";

import { setOutputVariable } from "./utils.js";

// Keep in sync with inventory.yml and benchmark.yml.
type AllAgents = "ts-perf1" | "ts-perf2" | "ts-perf3" | "ts-perf4";
// We reserve some agents so that non-baseline jobs can make progress.
type ReserveAgent = "ts-perf4";
type BaselineAgent = Exclude<AllAgents, ReserveAgent>;
type Agent = "any" | AllAgents;

type ScenarioLocation = "internal" | "public";

const defaultIterations = 6;

const hosts = {
    // This version is arbitrary (just what was latest on 2023-08-12).
    node20: "node@20.5.1",
    // This matches a recent VS Code version via Electron.
    node18: "node@18.15.0",
    bun: "bun@1.0.15",
    vscode: "vscode@1.82.1",
} as const satisfies Record<string, string>;

type HostName = typeof hosts[keyof typeof hosts];

const allJobKinds = ["tsc", "tsserver", "startup"] as const;
type JobKind = typeof allJobKinds[number];

const enum RunType {
    None = 0,
    Baseline = 1 << 0,
    OnDemand = 1 << 1,
    All = -1,
}

interface BaseScenario {
    readonly kind: JobKind;
    readonly name: string;
    readonly agent: BaselineAgent;
    readonly location: ScenarioLocation;
    readonly runIn: RunType;
}

// DO NOT change the agents; they must remain the same forever to keep benchmarks comparable.
const allScenarios: readonly BaseScenario[] = [
    { kind: "tsc", name: "Angular", agent: "ts-perf1", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "Monaco", agent: "ts-perf2", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "TFS", agent: "ts-perf3", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "material-ui", agent: "ts-perf1", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "Compiler-Unions", agent: "ts-perf2", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "xstate", agent: "ts-perf3", location: "internal", runIn: RunType.All },
    { kind: "tsc", name: "vscode", agent: "ts-perf1", location: "public", runIn: RunType.All },
    { kind: "tsc", name: "self-compiler", agent: "ts-perf2", location: "public", runIn: RunType.OnDemand }, // TODO(jakebailey): baseline
    { kind: "tsc", name: "self-build-src", agent: "ts-perf3", location: "public", runIn: RunType.OnDemand }, // TODO(jakebailey): baseline
    { kind: "tsc", name: "mui-docs", agent: "ts-perf1", location: "public", runIn: RunType.OnDemand },
    { kind: "tsc", name: "mui-docs-1", agent: "ts-perf1", location: "public", runIn: RunType.None }, // TODO(jakebailey): baseline
    { kind: "tsc", name: "webpack", agent: "ts-perf3", location: "public", runIn: RunType.OnDemand },
    { kind: "tsc", name: "webpack-1", agent: "ts-perf3", location: "public", runIn: RunType.None }, // TODO(jakebailey): baseline
    { kind: "tsserver", name: "Compiler-UnionsTSServer", agent: "ts-perf1", location: "internal", runIn: RunType.All },
    { kind: "tsserver", name: "CompilerTSServer", agent: "ts-perf2", location: "internal", runIn: RunType.All },
    { kind: "tsserver", name: "xstateTSServer", agent: "ts-perf3", location: "internal", runIn: RunType.All },
    { kind: "startup", name: "tsc-startup", agent: "ts-perf1", location: "internal", runIn: RunType.All },
    { kind: "startup", name: "tsserver-startup", agent: "ts-perf2", location: "internal", runIn: RunType.All },
    { kind: "startup", name: "tsserverlibrary-startup", agent: "ts-perf3", location: "internal", runIn: RunType.All },
    { kind: "startup", name: "typescript-startup", agent: "ts-perf1", location: "internal", runIn: RunType.All },
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

// Note: keep this up to date with TSPERF_PRESET and https://github.com/microsoft/typescript-bot-test-triggerer
const presets = {
    "baseline": () => generateBaselinePreset(baselineScenarios),
    "full": () => generateBaselinePreset(onDemandScenarios),
    *"regular"() {
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
    "faster"() {
        return this["tsc-only"]();
    },
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

    return { matrix, outputVariables };
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
