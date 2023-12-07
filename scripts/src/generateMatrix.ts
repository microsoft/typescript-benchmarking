import minimist from "minimist";

// Keep in sync with inventory.yml and benchmark.yml.
type AllAgents = "ts-perf1" | "ts-perf2" | "ts-perf3" | "ts-perf4";
// We reserve some agents so that non-baseline jobs can make progress.
type ReserveAgent = "ts-perf4";
type BaselineAgent = Exclude<AllAgents, ReserveAgent>;
type Agent = "any" | AllAgents;

const defaultIterations = 6;

// This version is arbitrary (just what was latest on 2023-08-12).
const node20 = "node@20.5.1";
// These two versions match those found in recent VS Code versions via Electron.
const node18 = "node@18.15.0";
const node16 = "node@16.17.1";
const bun = "bun@1.0.15";
const vscode = "vscode@1.82.1";

// TODO(jakebailey): include used scenarioConfigDirs in matrix and avoid cloning

const allTscScenarios = ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"] as const;
type TscScenario = typeof allTscScenarios[number];
const allTsserverScenarios = ["Compiler-UnionsTSServer", "CompilerTSServer", "xstateTSServer"] as const;
type TsserverScenario = typeof allTsserverScenarios[number];
const allStartupScenarios = [
    "tsc-startup",
    "tsserver-startup",
    "tsserverlibrary-startup",
    "typescript-startup",
] as const;
type StartupScenario = typeof allStartupScenarios[number];

type AllScenarios =
    | TscScenario
    | TsserverScenario
    | StartupScenario;

type ScenarioToAgent = {
    [key in AllScenarios]: BaselineAgent;
};

// This object maps each scenario to its baseline agent.
// DO NOT change these; they must remain the same forever to keep benchmarks comparable.
const scenarioToAgent = {
    "Angular": "ts-perf1",
    "Monaco": "ts-perf2",
    "TFS": "ts-perf3",
    "material-ui": "ts-perf1",
    "Compiler-Unions": "ts-perf2",
    "xstate": "ts-perf3",
    "Compiler-UnionsTSServer": "ts-perf1",
    "CompilerTSServer": "ts-perf2",
    "xstateTSServer": "ts-perf3",
    "tsc-startup": "ts-perf1",
    "tsserver-startup": "ts-perf2",
    "tsserverlibrary-startup": "ts-perf3",
    "typescript-startup": "ts-perf1",
} as const satisfies ScenarioToAgent;

interface Preset {
    tsc?: {
        hosts: readonly string[];
        iterations: number;
        scenarios: readonly TscScenario[];
    };
    tsserver?: {
        hosts: readonly string[];
        iterations: number;
        scenarios: readonly TsserverScenario[];
    };
    startup?: {
        hosts: readonly string[];
        iterations: number;
        scenarios: readonly StartupScenario[];
    };
}

// Note: keep this up to date with TSPERF_PRESET and https://github.com/microsoft/typescript-bot-test-triggerer
const presets: Record<string, Preset | undefined> = {
    "full": {
        tsc: {
            hosts: [node20, node18, node16],
            iterations: defaultIterations,
            scenarios: allTscScenarios,
        },
        tsserver: {
            hosts: [node16],
            iterations: defaultIterations,
            scenarios: allTsserverScenarios,
        },
        startup: {
            hosts: [node16],
            iterations: defaultIterations,
            scenarios: allStartupScenarios,
        },
    },
    "regular": {
        tsc: {
            hosts: [node18],
            iterations: defaultIterations,
            scenarios: allTscScenarios,
        },
        tsserver: {
            hosts: [node18],
            iterations: defaultIterations,
            scenarios: allTsserverScenarios,
        },
        startup: {
            hosts: [node18],
            iterations: defaultIterations,
            scenarios: allStartupScenarios,
        },
    },
    "tsc-only": {
        tsc: {
            hosts: [node18],
            iterations: defaultIterations,
            scenarios: allTscScenarios,
        },
    },
    "bun": {
        tsc: {
            hosts: [bun],
            iterations: defaultIterations * 2,
            scenarios: allTscScenarios,
        },
        startup: {
            hosts: [bun],
            iterations: defaultIterations,
            scenarios: allStartupScenarios.filter(s => s !== "tsserver-startup"),
        },
    },
    "vscode": {
        tsc: {
            hosts: [vscode],
            iterations: defaultIterations,
            scenarios: allTscScenarios,
        },
        tsserver: {
            hosts: [vscode],
            iterations: defaultIterations,
            scenarios: allTsserverScenarios,
        },
        startup: {
            hosts: [vscode],
            iterations: defaultIterations,
            scenarios: allStartupScenarios,
        },
    },
};

const args = minimist(process.argv.slice(2), {
    string: ["preset"],
});

const presetArg = args.preset;
const baselining = (process.env.USE_BASELINE_MACHINE || "FALSE").toUpperCase() === "TRUE";

const preset = presets[presetArg];
if (!preset) {
    // TODO(jakebailey): if "custom", build a custom matrix from arguments
    console.error(`Unknown preset: ${presetArg}`);
    process.exit(1);
}

function sanitizeJobName(name: string) {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

type Matrix = {
    [key in Agent]: {
        [name: string]: Record<string, string | number | boolean | undefined>;
    };
};

const matrix: Matrix = {
    "any": {},
    "ts-perf1": {},
    "ts-perf2": {},
    "ts-perf3": {},
    "ts-perf4": {},
};

let processTsc = false;
let processTsserver = false;
let processStartup = false;

if (baselining) {
    // If we're baselining, it'll be much faster to run all benchmarks in one job.
    processTsc = !!preset.tsc;
    processTsserver = !!preset.tsserver;
    processStartup = !!preset.startup;

    // TODO: remove this branch and instead matrix out for baselines
    matrix["ts-perf1"]["all"] = {
        TSPERF_JOB_NAME: "all",
        TSPERF_TSC: processTsc,
        TSPERF_TSC_HOSTS: preset.tsc?.hosts.join(","),
        TSPERF_TSC_SCENARIOS: preset.tsc?.scenarios.join(","),
        TSPERF_TSC_ITERATIONS: preset.tsc?.iterations,
        TSPERF_TSSERVER: processTsserver,
        TSPERF_TSSERVER_HOSTS: preset.tsserver?.hosts.join(","),
        TSPERF_TSSERVER_SCENARIOS: preset.tsserver?.scenarios.join(","),
        TSPERF_TSSERVER_ITERATIONS: preset.tsserver?.iterations,
        TSPERF_STARTUP: processStartup,
        TSPERF_STARTUP_HOSTS: preset.startup?.hosts.join(","),
        TSPERF_STARTUP_SCENARIOS: preset.startup?.scenarios.join(","),
        TSPERF_STARTUP_ITERATIONS: preset.startup?.iterations,
    };
}
else {
    // If we're not baselining, it should end up faster to run on as many machines as possible.
    if (preset.tsc) {
        for (const host of preset.tsc.hosts) {
            for (const scenario of preset.tsc.scenarios) {
                processTsc = true;
                const agent = baselining ? scenarioToAgent[scenario] : "any";
                const jobName = sanitizeJobName(`tsc_${host}_${scenario}`);
                matrix[agent][jobName] = {
                    TSPERF_JOB_NAME: jobName,
                    TSPERF_TSC: true,
                    TSPERF_TSC_HOSTS: host,
                    TSPERF_TSC_SCENARIOS: scenario,
                    TSPERF_TSC_ITERATIONS: preset.tsc.iterations,
                };
            }
        }
    }

    if (preset.tsserver) {
        for (const host of preset.tsserver.hosts) {
            for (const scenario of preset.tsserver.scenarios) {
                processTsserver = true;
                const agent = baselining ? scenarioToAgent[scenario] : "any";
                const jobName = sanitizeJobName(`tsserver_${host}_${scenario}`);
                matrix[agent][jobName] = {
                    TSPERF_JOB_NAME: jobName,
                    TSPERF_TSSERVER: true,
                    TSPERF_TSSERVER_HOSTS: host,
                    TSPERF_TSSERVER_SCENARIOS: scenario,
                    TSPERF_TSSERVER_ITERATIONS: preset.tsserver.iterations,
                };
            }
        }
    }

    if (preset.startup) {
        for (const host of preset.startup.hosts) {
            for (const scenario of preset.startup.scenarios) {
                processStartup = true;
                const agent = baselining ? scenarioToAgent[scenario] : "any";
                const jobName = sanitizeJobName(`startup_${host}_${scenario}`);
                matrix[agent][jobName] = {
                    TSPERF_JOB_NAME: jobName,
                    TSPERF_STARTUP: true,
                    TSPERF_STARTUP_HOSTS: host,
                    TSPERF_STARTUP_SCENARIOS: scenario,
                    TSPERF_STARTUP_ITERATIONS: preset.startup.iterations,
                };
            }
        }
    }
}

function setVariable(name: string, value: string | number | boolean) {
    console.log(`${name}=${value}`);
    console.log(`##vso[task.setvariable variable=${name};isOutput=true]${value}`);
}

for (const [agent, value] of Object.entries(matrix)) {
    setVariable(`MATRIX_${agent.replace(/-/g, "_")}`, JSON.stringify(value));
    console.log(JSON.stringify(value, undefined, 4));
}

// These are outputs for the ProcessResults job, specifying which results were
// produced above and need to be processed.
setVariable("TSPERF_PROCESS_TSC", processTsc);
setVariable("TSPERF_PROCESS_TSSERVER", processTsserver);
setVariable("TSPERF_PROCESS_STARTUP", processStartup);
