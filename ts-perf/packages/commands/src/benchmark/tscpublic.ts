const [typescript, ...args] = process.argv.slice(2);

interface TypeScript {
    Debug: {
        loggingHost: {
            log(level: unknown, s: string): void;
        };
        isDebugging: boolean;
        enableDebugInfo(): void;
    };
    executeCommandLine?(sys: {}, cb: () => void, args: string[]): void;
    noop(): void;
    sys: {
        args: string[];
        newLine: string;
        write(s: string): void;
        tryEnableSourceMapsForHost?(): void;
        setBlocking?(): void;
        getEnvironmentVariable(name: string): string;
    };
}

const ts: TypeScript = require(typescript);

if (!ts.executeCommandLine) {
    throw new Error("Expected TypeScript API to have executeCommandLine method");
}

ts.sys.args = args;

// Copied from https://github.com/microsoft/TypeScript/blob/main/src/tsc/tsc.ts
ts.Debug.loggingHost = {
    log(_level, s) {
        ts.sys.write(`${s || ""}${ts.sys.newLine}`);
    },
};

if (ts.Debug.isDebugging) {
    ts.Debug.enableDebugInfo();
}

if (ts.sys.tryEnableSourceMapsForHost && /^development$/i.test(ts.sys.getEnvironmentVariable("NODE_ENV"))) {
    ts.sys.tryEnableSourceMapsForHost();
}

if (ts.sys.setBlocking) {
    ts.sys.setBlocking();
}

ts.executeCommandLine(ts.sys, ts.noop, ts.sys.args);
