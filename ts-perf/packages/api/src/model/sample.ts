// Note: if adding new sample types/properties here, also update isValueKey in measurement.ts.

import { TSServerCommandName } from "./tsserverconfig";

export const compilerSampleKeys = [
    "errors",
    "symbols",
    "types",
    "memoryUsed",
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

export type SampleKey =
    | CompilerSampleKey
    | TSServerSampleKey
    | StartupSampleKey;

export function isSampleKey(key: string): key is SampleKey {
    return isCompilerSampleKey(key) || isTSServerSampleKey(key) || isStartupSampleKey(key);
}
