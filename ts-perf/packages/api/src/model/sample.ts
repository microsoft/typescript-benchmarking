// Note: if adding new sample types/properties here, also update isValueKey in measurement.ts.

import { TSServerCommandName } from "./tsserverconfig";

export const compilerSampleKeys = [
    "errors",
    "symbols",
    "types",
    "memoryUsed",
    "memoryAllocs",
    "configTime",
    "parseTime",
    "bindTime",
    "checkTime",
    "emitTime",
    "totalTime",
] as const;

export type CompilerSampleKey = typeof compilerSampleKeys[number];

export function isCompilerSampleKey(key: string): key is CompilerSampleKey {
    return compilerSampleKeys.includes(key as CompilerSampleKey);
}

export type CompilerSample = { [K in CompilerSampleKey]?: number; };

// NOTE: the order of these keys is used to determine the order of columns
// in the output.
const compilerSampleKeyToDiagnosticName = {
    errors: "Errors",
    symbols: "Symbols",
    types: "Types",
    memoryUsed: "Memory used",
    memoryAllocs: "Memory allocs",
    configTime: "Config time",
    parseTime: "Parse time",
    bindTime: "Bind time",
    checkTime: "Check time",
    emitTime: "Emit time",
    totalTime: "Total time",
} as const satisfies { [K in CompilerSampleKey]: string; };

const compilerMetricOrder = Object.fromEntries(
    Object.values(compilerSampleKeyToDiagnosticName).map((name, index) => [name.toLowerCase(), index]),
) as Record<string, number | undefined>;

export function getCompilerMetricIndex(metric: string) {
    return compilerMetricOrder[metric.toLowerCase()] ?? -1;
}

function reverseMap<const T extends Record<string, string>>(map: T): { [P in keyof T as T[P]]: P; } {
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) as any;
}

const compilerDiagnosticNameToSampleName = reverseMap(compilerSampleKeyToDiagnosticName);
export type CompilerDiagnosticName = keyof typeof compilerDiagnosticNameToSampleName;

export function getCompilerSampleNameFromDiagnosticName(name: CompilerDiagnosticName) {
    return compilerDiagnosticNameToSampleName[name];
}

export function isCompilerDiagnosticName(name: string): name is CompilerDiagnosticName {
    return name in compilerDiagnosticNameToSampleName;
}

export function getCompilerMetricName(sampleName: CompilerSampleKey) {
    // Special case names known by the benchmarking dashboard, even though they differ from what the compiler prints.
    switch (sampleName) {
        case "memoryUsed":
            return "Memory Used";
        case "memoryAllocs":
            return "Memory Allocs";
        case "configTime":
            return "Config Time";
        case "parseTime":
            return "Parse Time";
        case "bindTime":
            return "Bind Time";
        case "checkTime":
            return "Check Time";
        case "emitTime":
            return "Emit Time";
        case "totalTime":
            return "Total Time";
        default:
            return compilerSampleKeyToDiagnosticName[sampleName];
    }
}

const compilerSampleKeyToUnit = {
    errors: "",
    symbols: "",
    types: "",
    memoryUsed: "k",
    memoryAllocs: "",
    configTime: "s",
    parseTime: "s",
    bindTime: "s",
    checkTime: "s",
    emitTime: "s",
    totalTime: "s",
} as const satisfies { [K in CompilerSampleKey]: "s" | "k" | ""; };

export function getCompilerSampleKeyUnit(key: CompilerSampleKey) {
    return compilerSampleKeyToUnit[key];
}

export type TSServerSample = Record<string, number | undefined>;

const serverKeys: TSServerCommandName[] = [
    "updateOpen",
    "geterr",
    "references",
    "navto",
    "completionInfo",
];

export type TSServerSampleKey = `Req ${number} - ${TSServerCommandName}${" count" | ""}`;

const serverKeyRegex = /^req\s+\d+\s+-\s+([a-z]+)(\s+count)?$/i;

export function isTSServerSampleKey(key: string): key is TSServerSampleKey {
    const regexResult = serverKeyRegex.exec(key);
    return !!regexResult && serverKeys.includes(regexResult[1] as TSServerCommandName);
}

export const startupSampleKeys = [
    "executionTime",
] as const;

export type StartupSampleKey = typeof startupSampleKeys[number];

export function isStartupSampleKey(key: string): key is StartupSampleKey {
    return startupSampleKeys.includes(key as StartupSampleKey);
}

export type StartupSample = { [K in StartupSampleKey]?: number; };

export const apiTimingMetrics = {
    apiClientInstances: { metric: "API client instances", unit: " clients", precision: 0 },
    apiRequests: { metric: "API client requests", unit: " requests", precision: 0 },
    apiRoundTripTime: { metric: "API client round trip (sum)", unit: "ms", precision: 3 },
    apiBytesSent: { metric: "API client bytes sent", unit: "B", precision: 0 },
    apiBytesReceived: { metric: "API client bytes received", unit: "B", precision: 0 },
    apiNodesMaterialized: { metric: "API client nodes materialized", unit: " nodes", precision: 0 },
    apiSourceFilesFetched: { metric: "API client source files fetched", unit: " files", precision: 0 },
    apiNodesFetched: { metric: "API client nodes fetched", unit: " nodes", precision: 0 },
    apiServerRequests: { metric: "API server-counter requests", unit: " requests", precision: 0 },
    apiServerProcessingTime: { metric: "API server-counter processing (sum)", unit: "ms", precision: 3 },
    apiTransportResidualTime: {
        metric: "API client round trip minus server processing (not pure IPC)",
        unit: "ms",
        precision: 3,
    },
} as const;

export type ApiTimingSampleKey = keyof typeof apiTimingMetrics;
export const apiTimingSampleKeys = Object.keys(apiTimingMetrics) as ApiTimingSampleKey[];

export function isApiTimingSampleKey(key: string): key is ApiTimingSampleKey {
    return Object.hasOwn(apiTimingMetrics, key);
}

export const apiMemoryMetrics = {
    apiClientProcesses: { metric: "API client processes", unit: " processes", precision: 0 },
    apiClientSampledAllocations: { metric: "API client JS allocated (sampled estimate, sum)", unit: "B", precision: 0 },
    apiClientHeapUsed: { metric: "API client heap at close (sum of process maxima)", unit: "B", precision: 0 },
    apiClientPeakRSS: { metric: "API client lifetime peak RSS (max process)", unit: "B", precision: 0 },
    apiServerProcesses: { metric: "API server processes", unit: " processes", precision: 0 },
    apiServerAllocations: { metric: "API server Go allocated (exact cumulative, sum)", unit: "B", precision: 0 },
    apiServerHeapUsed: { metric: "API server heap at close (sum of process maxima)", unit: "B", precision: 0 },
    apiServerPeakRSS: { metric: "API server lifetime peak RSS (max process)", unit: "B", precision: 0 },
} as const;

export type ApiMemorySampleKey = keyof typeof apiMemoryMetrics;
export const apiMemorySampleKeys = Object.keys(apiMemoryMetrics) as ApiMemorySampleKey[];

export function isApiMemorySampleKey(key: string): key is ApiMemorySampleKey {
    return Object.hasOwn(apiMemoryMetrics, key);
}

export type SampleKey =
    | CompilerSampleKey
    | TSServerSampleKey
    | StartupSampleKey
    | ApiTimingSampleKey
    | ApiMemorySampleKey;

export function isSampleKey(key: string): key is SampleKey {
    return isCompilerSampleKey(key) || isTSServerSampleKey(key) || isStartupSampleKey(key)
        || isApiTimingSampleKey(key) || isApiMemorySampleKey(key);
}
