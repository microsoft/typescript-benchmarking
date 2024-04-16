import assert from "node:assert";
import { isDeepStrictEqual } from "node:util";

import esMain from "es-main";
import prettyMilliseconds from "pretty-ms";
import sortKeys from "sort-keys";

import { $pipe, getNonEmptyEnv, parseBoolean, setJobVariable, setOutputVariable } from "./utils.js";

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
const defaultWarmups = 1;

// TODO(jakebailey): have unpinned variants; ts-perf mostly supports @latest.
const hosts = {
    // This version is arbitrary (just what was latest on 2023-08-12).
    node20: "node@20.5.1",
    // This matches a recent VS Code version via Electron.
    node18: "node@18.15.0",
    bun: "bun@1.0.35",
    vscode: "vscode@1.82.1",
} as const satisfies Record<string, string>;

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
    { kind: "tsc", name: "Compiler-Unions", agent: "ts-perf2", location: "public", runIn: RunType.Any, cost: 17 },
    { kind: "tsc", name: "xstate", agent: "ts-perf3", location: "internal", runIn: RunType.Any, cost: 9 },
    { kind: "tsc", name: "vscode", agent: "ts-perf3", location: "public", runIn: RunType.Any, cost: 107 },
    {
        kind: "tsc",
        name: "ts-pre-modules",
        agent: "ts-perf3",
        location: "public",
        runIn: RunType.Any,
        cost: 25,
    },
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
    readonly host: string;
    readonly iterations: number;
    readonly warmups: number;
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
                    warmups: defaultWarmups,
                };
            }
        }
        else {
            yield {
                ...scenario,
                host: hosts.node18,
                iterations: defaultIterations,
                warmups: defaultWarmups,
            };
        }
    }
}

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
                warmups: defaultWarmups,
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
                    warmups: defaultWarmups,
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
                    warmups: defaultWarmups,
                };
            }
            else if (scenario.kind === "startup" && scenario.name !== "tsserver-startup") {
                yield {
                    ...scenario,
                    host: hosts.bun,
                    iterations: defaultIterations,
                    warmups: defaultWarmups,
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
                warmups: defaultWarmups,
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
                    warmups: defaultWarmups,
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
    TSPERF_JOB_HOST: string;
    TSPERF_JOB_SCENARIO: ScenarioName;
    TSPERF_JOB_ITERATIONS: number;
    TSPERF_JOB_WARMUPS: number;
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
    isComparison: boolean;
    isCustomCommitRange: boolean;
    baselineCommit: string;
    baselineName: string;
    newCommit: string;
    newName: string;
}

async function parseInput({ input, isPr, gitParseRev }: SetupPipelineInput) {
    const parsed: Parameters = {
        preset: isPr ? "regular" : "baseline",
        predictable: undefined,
        hosts: undefined,
        isComparison: isPr,
        isCustomCommitRange: false,
        ...isPr ? {
            baselineCommit: "HEAD^1",
            baselineName: "baseline",
            newCommit: "HEAD",
            newName: "pr",
        } : {
            baselineCommit: "HEAD",
            baselineName: "baseline",
            newCommit: "",
            newName: "",
        },
    };

    let parsedPresetName = false;

    for (const part of input.trim().split(/\s+/)) {
        if (!parsedPresetName) {
            parsedPresetName = true;
            if (part === "default") {
                continue;
            }

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
            case "commit":
            case "commits":
                // If updating this, make sure benchmark.yml still fixes the repo properly.
                if (!value) {
                    throw new Error(`Expected value for ${key}`);
                }

                if (!value.includes("...") && value.includes("..")) {
                    throw new Error(`Expected "..." in ${key}, not ".."`);
                }

                const { baselineCommit, baselineName, newCommit, newName } = await gitParseRev(value);
                parsed.baselineCommit = baselineCommit;
                parsed.baselineName = baselineName;
                parsed.newCommit = newCommit ?? "";
                parsed.newName = newName ?? "";
                parsed.isComparison = !!newCommit;
                parsed.isCustomCommitRange = true;
                break;
        }
    }

    return parsed;
}

function* transformPreset(parameters: Parameters, iter: Iterable<Scenario>): Iterable<Scenario> {
    const all = [...worker()];

    for (const scenario of all) {
        let dupe = false;
        for (const other of all) {
            if (other === scenario) {
                continue;
            }
            if (isDeepStrictEqual(scenario, other)) {
                dupe = true;
                break;
            }
        }
        if (!dupe) {
            yield scenario;
        }
    }

    function* worker(): Iterable<Scenario> {
        for (const scenario of iter) {
            const hosts = parameters.hosts ?? [scenario.host];

            for (const host of hosts) {
                yield {
                    ...scenario,
                    host,
                };
            }
        }
    }
}

export interface GitParseRevResult {
    baselineCommit: string;
    baselineName: string;
    newCommit?: string;
    newName?: string;
}

export interface SetupPipelineInput {
    input: string;
    baselining: boolean;
    isPr: boolean;
    shouldLog: boolean;
    gitParseRev: (query: string) => Promise<GitParseRevResult>;
}

export async function setupPipeline(input: SetupPipelineInput) {
    const { baselining, shouldLog } = input;

    const parameters = await parseInput(input);
    if (shouldLog) {
        console.log("Parameters", parameters);
    }

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

    for (const scenario of transformPreset(parameters, preset())) {
        const agent = baselining ? scenario.agent : "any";
        const jobName = sanitizeJobName(`${scenario.kind}_${scenario.host}_${scenario.name}`);
        matrix[agent][jobName] = {
            TSPERF_JOB_KIND: scenario.kind,
            TSPERF_JOB_NAME: jobName,
            TSPERF_JOB_HOST: scenario.host,
            TSPERF_JOB_SCENARIO: scenario.name,
            TSPERF_JOB_ITERATIONS: scenario.iterations,
            TSPERF_JOB_WARMUPS: scenario.warmups,
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

    outputVariables[`TSPERF_PREDICTABLE`] = parameters.predictable ? "true" : "false";
    outputVariables["TSPERF_IS_CUSTOM_COMMIT_RANGE"] = parameters.isCustomCommitRange ? "true" : "false";
    outputVariables["TSPERF_IS_COMPARISON"] = parameters.isComparison ? "true" : "false";
    outputVariables[`TSPERF_BASELINE_COMMIT`] = parameters.baselineCommit;
    outputVariables[`TSPERF_BASELINE_NAME`] = parameters.baselineName;
    outputVariables[`TSPERF_NEW_COMMIT`] = parameters.newCommit;
    outputVariables[`TSPERF_NEW_NAME`] = parameters.newName;

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
    async function gitParseRev(query: string): Promise<GitParseRevResult> {
        const cwd = getNonEmptyEnv("TYPESCRIPT_DIR");

        const { stdout: stdoutHash } = await $pipe`git -C ${cwd} rev-parse ${query}`;
        const lines = stdoutHash.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("^")) as [
            first: string,
            second?: string,
        ];
        assert(lines.length === 1 || lines.length === 2, `Expected 1 or 2 lines, got ${lines.length}`);

        if (lines.length === 1) {
            const baselineCommit = lines[0];
            return {
                baselineCommit,
                baselineName: await getName(query, baselineCommit),
            };
        }

        assert(query.includes("..."), "Expected '...' in query");
        const [baselineRef, newRef] = query.split("...", 2);

        // The order swap is intentional; git rev-parse A...B returns [B, A, merge base].
        const baselineCommit = lines[1]!;
        const newCommit = lines[0];

        return {
            baselineCommit,
            baselineName: await getName(baselineRef, baselineCommit),
            newCommit,
            newName: await getName(newRef, newCommit),
        };

        async function getName(input: string, commitHash: string): Promise<string> {
            if (!commitHash.startsWith(input)) {
                const { stdout: decorateStdout } =
                    await $pipe`git -C ${cwd} log -1 --pretty=${"format:%(decorate:prefix=,suffix=,separator= ,tag=tag:)"} ${commitHash}`;

                for (const decoration of decorateStdout.split(/\s+/).reverse()) {
                    if (decoration && !decoration.startsWith("tag:")) {
                        return decoration;
                    }
                }
            }

            const { stdout: refStdout } = await $pipe`git -C ${cwd} rev-parse --short ${commitHash}`;
            return refStdout;
        }
    }

    const input = getNonEmptyEnv("TSPERF_PRESET");
    const baselining = parseBoolean(process.env.USE_BASELINE_MACHINE, false);
    const isPr = parseBoolean(process.env.IS_PR, false);

    const { outputVariables } = await setupPipeline({
        input,
        baselining,
        isPr,
        shouldLog: true,
        gitParseRev,
    });
    for (const [key, value] of Object.entries(outputVariables)) {
        setOutputVariable(key, value);
        // Also set them as environment variables for the job.
        setJobVariable(key, value);
    }
}
