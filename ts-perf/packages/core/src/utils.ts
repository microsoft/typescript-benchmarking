import * as os from "node:os";
import * as path from "node:path";

export const userDirectory = path.resolve(os.homedir(), ".tsperf");
export const hostsDirectory = path.resolve(userDirectory, "hosts");
export const localScenariosDirectory = path.resolve(userDirectory, "scenarios");
export const logDirectory = path.resolve(userDirectory, "logs");

export class ProcessExitError extends Error {
    readonly exitCode!: number;

    constructor(message?: string);
    constructor(exitCode: number, message?: string);
    constructor(...args: [string?] | [number, string?]) {
        if (ProcessExitError.isExitCodeOverload(args)) {
            const exitCode = args[0];
            const message = args[1] || `Process exited with code ${exitCode}.`;
            super(message);
            this.exitCode = exitCode;
        }
        else {
            const message = args[0];
            super(message);
            this.exitCode = 0;
        }
    }

    toJSON() {
        return { exitCode: this.exitCode };
    }

    private static isExitCodeOverload(args: any): args is [number, string?] {
        return typeof args[0] === "number";
    }
}
