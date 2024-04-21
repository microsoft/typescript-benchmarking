// Note: if adding new sample types/properties here, also update isValueKey in measurement.ts.

export const compilerSampleKeys = [
    "parseTime",
    "bindTime",
    "checkTime",
    "emitTime",
    "totalTime",
    "memoryUsed",
] as const;

export type CompilerSampleKey = typeof compilerSampleKeys[number];

export type CompilerSample = { [K in CompilerSampleKey]?: number };

export type TSServerSample = Record<string, number | undefined>;

export const startupSampleKeys = [
    "executionTime",
] as const;

export type StartupSampleKey = typeof startupSampleKeys[number];

export type StartupSample = { [K in StartupSampleKey]?: number };
