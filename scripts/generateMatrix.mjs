import minimist from "minimist";

/**
 * @typedef {Object} Preset
 * @property {Object} [tsc]
 * @property {string[]} tsc.hosts
 * @property {number} tsc.iterations
 * @property {string[]} tsc.scenarios
 * @property {Object} [tsserver]
 * @property {string[]} tsserver.hosts
 * @property {number} tsserver.iterations
 * @property {string[]} tsserver.scenarios
 * @property {Object} [startup]
 * @property {string[]} startup.hosts
 * @property {number} startup.iterations
 * @property {string[]} startup.scenarios
 */
void 0;

// Note: keep this up to date with TSPERF_PRESET.
/** @type {Record<string, Preset | undefined>} */
const presets = {
    "full": {
        tsc: {
            hosts: ["node@18.10.0", "node@16.17.1", "node@14.21.3"],
            iterations: 6,
            scenarios: ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"],
        },
        tsserver: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["Compiler-UnionsTSServer", "CompilerTSServer", "xstateTSServer"],
        },
        startup: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["tsc-startup", "tsserver-startup", "tsserverlibrary-startup", "typescript-startup"],
        },
    },
    "regular": {
        tsc: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"],
        },
        tsserver: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["Compiler-UnionsTSServer", "CompilerTSServer", "xstateTSServer"],
        },
        startup: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["tsc-startup", "tsserver-startup", "tsserverlibrary-startup", "typescript-startup"],
        },
    },
    "tsc-only": {
        tsc: {
            hosts: ["node@16.17.1"],
            iterations: 6,
            scenarios: ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"],
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
    // TODO: if "custom", build a custom matrix from arguments
    console.error(`Unknown preset: ${presetArg}`);
    process.exit(1);
}

/**
 * @param {string} name
 */
function sanitizeJobName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** @type {Record<string, Record<string, string | number | boolean | undefined>>} */
const matrix = {};

let mergeTsc = false;
let mergeTsserver = false;
let mergeStarup = false;

if (baselining) {
    // If we're baselining, it'll be much faster to run all benchmarks in one job.
    if (preset.tsc) {
        mergeTsc = true;
    }
    if (preset.tsserver) {
        mergeTsserver = true;
    }
    if (preset.startup) {
        mergeStarup = true;
    }

    matrix["all"] = {
        TSPERF_JOB_NAME: "all",
        TSPERF_TSC: !!preset.tsc?.iterations,
        TSPERF_TSC_HOSTS: preset.tsc?.hosts.join(","),
        TSPERF_TSC_SCENARIOS: preset.tsc?.scenarios.join(","),
        TSPERF_TSC_ITERATIONS: preset.tsc?.iterations,
        TSPERF_TSSERVER: !!preset.tsserver?.iterations,
        TSPERF_TSSERVER_HOSTS: preset.tsserver?.hosts.join(","),
        TSPERF_TSSERVER_SCENARIOS: preset.tsserver?.scenarios.join(","),
        TSPERF_TSSERVER_ITERATIONS: preset.tsserver?.iterations,
        TSPERF_STARTUP: !!preset.startup?.iterations,
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
                mergeTsc = true;
                const jobName = sanitizeJobName(`tsc_${host}_${scenario}`);
                matrix[jobName] = {
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
                mergeTsserver = true;
                const jobName = sanitizeJobName(`tsserver_${host}_${scenario}`);
                matrix[jobName] = {
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
                mergeStarup = true;
                const jobName = sanitizeJobName(`startup_${host}_${scenario}`);
                matrix[jobName] = {
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

console.log(JSON.stringify(matrix, undefined, 4));
console.log(`##vso[task.setvariable variable=MATRIX;isOutput=true]${JSON.stringify(matrix)}`);

console.log(`##vso[task.setvariable variable=TSPERF_MERGE_TSC;isOutput=true]${mergeTsc}`);
console.log(`##vso[task.setvariable variable=TSPERF_MERGE_TSSERVER;isOutput=true]${mergeTsserver}`);
console.log(`##vso[task.setvariable variable=TSPERF_MERGE_STARTUP;isOutput=true]${mergeStarup}`);
