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

/** @type {Record<string, Preset | undefined>} */
const presets = {
    "full": {
        "tsc": {
            "hosts": ["node@18.10.0", "node@16.17.1", "node@14.21.3"],
            "iterations": 10,
            "scenarios": ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"],
        },
        "tsserver": {
            "hosts": ["node@16.17.1"],
            "iterations": 10,
            "scenarios": ["Compiler-UnionsTSServer", "CompilerTSServer", "xstateTSServer"],
        },
        "startup": {
            "hosts": ["node@16.17.1"],
            "iterations": 10,
            "scenarios": ["tsc-startup", "tsserver-startup", "tsserverlibrary-startup", "typescript-startup"],
        },
    },
    "faster": {
        "tsc": {
            "hosts": ["node@16.17.1"],
            "iterations": 10,
            "scenarios": ["Angular", "Monaco", "TFS", "material-ui", "Compiler-Unions", "xstate"],
        },
    },
};

const preset = presets[process.argv[2]];
if (!preset) {
    // TODO: if "custom", build a custom matrix from arguments
    console.error(`Unknown preset: ${process.argv[2]}`);
    process.exit(1);
}

/** @type {Record<string, Record<string, string | number | boolean>>} */
const matrix = {};

let hasTsc = false;
let hasTsserver = false;
let hasStartup = false;

if (preset.tsc) {
    for (const host of preset.tsc.hosts) {
        for (const scenario of preset.tsc.scenarios) {
            hasTsc = true;
            matrix[`tsc_${host}_${scenario}`] = {
                "TSPERF_KIND": "tsc",
                "TSPERF_HOST": host,
                "TSPERF_SCENARIO": scenario,
                "TSPERF_ITERATIONS": preset.tsc.iterations,
            };
        }
    }
}

if (preset.tsserver) {
    for (const host of preset.tsserver.hosts) {
        for (const scenario of preset.tsserver.scenarios) {
            hasTsserver = true;
            matrix[`tsserver_${host}_${scenario}`] = {
                "TSPERF_KIND": "tsserver",
                "TSPERF_HOST": host,
                "TSPERF_SCENARIO": scenario,
                "TSPERF_ITERATIONS": preset.tsserver.iterations,
            };
        }
    }
}

if (preset.startup) {
    for (const host of preset.startup.hosts) {
        for (const scenario of preset.startup.scenarios) {
            hasStartup = true;
            matrix[`startup_${host}_${scenario}`] = {
                "TSPERF_KIND": "startup",
                "TSPERF_HOST": host,
                "TSPERF_SCENARIO": scenario,
                "TSPERF_ITERATIONS": preset.startup.iterations,
            };
        }
    }
}

console.log(JSON.stringify(matrix, undefined, 4));
console.log(`##vso[task.setvariable variable=MATRIX;isOutput=true]${JSON.stringify(matrix)}`);

console.log(`##vso[task.setvariable variable=TSPERF_RUN_TSC;isOutput=true]${hasTsc}`);
console.log(`##vso[task.setvariable variable=TSPERF_RUN_TSSERVER;isOutput=true]${hasTsserver}`);
console.log(`##vso[task.setvariable variable=TSPERF_RUN_STARTUP;isOutput=true]${hasStartup}`);
