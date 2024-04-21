// Note: if adding new sample types/properties here, also update isValueKey in measurement.ts.

export interface CompilerSample {
    parseTime: number;
    bindTime: number;
    checkTime: number;
    emitTime: number;
    totalTime: number;
    memoryUsed: number;
}

export type TSServerSample = Record<string, number>;

export interface StartupSample {
    executionTime: number;
}
