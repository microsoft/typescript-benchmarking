/**
 * @typedef {Object} Preset
 * @property {Object} tsc
 * @property {string[]} tsc.hosts
 * @property {number} tsc.iterations
 * @property {string[]} tsc.scenarios
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
        // TODO: others
    },
    "fast": {
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

for (const host of preset.tsc.hosts) {
    for (const scenario of preset.tsc.scenarios) {
        matrix[`tsc_${host}_${scenario}`] = {
            "TSPERF_KIND": "tsc",
            "TSPERF_HOST": host,
            "TSPERF_SCENARIO": scenario,
            "TSPERF_ITERATIONS": preset.tsc.iterations,
        };
    }
}

console.log(JSON.stringify(matrix, undefined, 4));
console.log(`##vso[task.setvariable variable=matrix;isOutput=true]${JSON.stringify(matrix)}`);
