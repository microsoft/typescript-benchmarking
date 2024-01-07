import * as fs from "node:fs";
import * as path from "node:path";

import { CommandLineOption, CommandLineOptionSet, CommandLineOptionSets, CommandLineParseError } from "power-options";

export interface CompilerOptions {
    tsc: string;
    suite: string;
    full?: boolean;
    compilerOptions?: string[];
}

export interface TSServerOptions {
    tsserver: string;
    suite: string;
    extended: boolean;
}

export interface StartupOptions {
    builtDir: string;
}

const suite: CommandLineOption = {
    type: "string",
    validate: validatePath,
    defaultValue(parsed) {
        const tsc = parsed["tsc"] as string;
        const suite = findPath(process.cwd(), "./cases/perf/solutions")
            || (process.env.TYPESCRIPT_INTERNAL_REPOSITORY
                && findPath(process.env.TYPESCRIPT_INTERNAL_REPOSITORY, "./cases/perf/solutions"))
            || (tsc && findPath(path.dirname(tsc), "./internal/cases/perf/solutions"))
            || findPath(__dirname, "./cases/perf/solutions");
        if (!suite) {
            throw new CommandLineParseError(
                `Could not resolve the path to the test suite (i.e. './cases/perf/solutions'). Try specifying '--suite'.`,
            );
        }
        return suite;
    },
    param: "directory",
    description: "Use <directory> as the root location for test suites (i.e. './internal/cases/perf/solutions').",
};

const compiler: CommandLineOptionSet = {
    merge: true,
    options: {
        tsc: {
            type: "string",
            validate: validatePath,
            defaultValue() {
                const tsc = findPath(process.cwd(), "./built/local/tsc.js")
                    || (process.env.TYPESCRIPT_REPOSITORY
                        && findPath(process.env.TYPESCRIPT_REPOSITORY, "./built/local/tsc.js"))
                    || findPath(__dirname, "./built/local/tsc.js");
                if (!tsc) {
                    throw new CommandLineParseError(
                        `Could not resolve the path to the built compiler (i.e. './built/local/tsc.js'). Try specifying '--tsc'.`,
                    );
                }
                return tsc;
            },
            param: "file",
            description: "Use <file> as the compiler (i.e. './built/local/tsc.js').",
        },
        suite,
        full: {
            type: "boolean",
            description: "Runs the compiler with additional options.",
        },
        compilerOptions: {
            type: "string",
            passthru: true,
            description: "Any arguments following -- will be interpreted by the compiler.",
        },
    },
};

const tsserver: CommandLineOptionSet = {
    merge: true,
    options: {
        tsserver: {
            type: "string",
            validate: validatePath,
            defaultValue() {
                const tsserver = findPath(process.cwd(), "./built/local/tsserver.js")
                    || (process.env.TYPESCRIPT_REPOSITORY
                        && findPath(process.env.TYPESCRIPT_REPOSITORY, "./built/local/tsserver.js"))
                    || findPath(__dirname, "./built/local/tsserver.js");
                if (!tsserver) {
                    throw new CommandLineParseError(
                        `Could not resolve the path to the built tsserver (i.e. './built/local/tsserver.js'). Try specifying '--tsserver'.`,
                    );
                }
                return tsserver;
            },
            param: "file",
            description: "Use <file> as the tsserver (i.e. './built/local/tsserver.js').",
        },
        suite,
        extended: {
            type: "boolean",
            description: "If the scenario declares optional (aka extended) requests, run those as well.",
            defaultValue: false,
        },
    },
};

const startup: CommandLineOptionSet = {
    merge: true,
    options: {
        builtDir: {
            type: "string",
            validate: validatePath,
            defaultValue() {
                const builtDir = findPath(process.cwd(), "./built/local")
                    || (process.env.TYPESCRIPT_REPOSITORY
                        && findPath(process.env.TYPESCRIPT_REPOSITORY, "./built/local"))
                    || findPath(__dirname, "./built/local");
                if (!builtDir) {
                    throw new CommandLineParseError(
                        `Could not resolve the path to the built directory (i.e. './built/local'). Try specifying '--builtDir'.`,
                    );
                }
                return builtDir;
            },
            param: "directory",
            description: "Use <directory> as the built local dir (i.e. './built/local').",
        },
        suite,
    },
};

export interface AzureStorageOptions {
    azureStorageConnectionString?: string;
    azureStorageAccount?: string;
    azureStorageAccessKey?: string;
    azureStorageContainer?: string;
}

const azureStorage: CommandLineOptionSet = {
    merge: true,
    visibility: "advanced",
    options: {
        azureStorageConnectionString: {
            type: "string",
            param: "string",
            description:
                "Azure storage connection string (uses TSPERF_AZURE_STORAGE_CONNECTION_STRING environment variable if found).",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_CONNECTION_STRING!,
        },
        azureStorageAccount: {
            type: "string",
            param: "name",
            description:
                "Azure storage account when using blob storage (uses TSPERF_AZURE_STORAGE_ACCOUNT environment variable if found).",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_ACCOUNT!,
        },
        azureStorageAccessKey: {
            type: "string",
            param: "key",
            description:
                "Azure storage access key when using blob storage (uses TSPERF_AZURE_STORAGE_ACCESS_KEY environment variable if found).",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_ACCESS_KEY!,
        },
        azureStorageContainer: {
            type: "string",
            param: "container",
            description:
                "Container to use when using blob storage (uses TSPERF_AZURE_STORAGE_CONTAINER environment variable if found).",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_CONTAINER!,
        },
    },
};

export const optionSets: CommandLineOptionSets = {
    compiler,
    tsserver,
    startup,
    azureStorage,
};

function validatePath(value: string, arg: string) {
    if (!fs.existsSync(value)) {
        throw new CommandLineParseError(`Option '${arg}' path not found: '${value}'.`);
    }
}

function findPath(root: string, relative: string) {
    root = path.resolve(root);
    while (root) {
        const tscPath = path.resolve(root, relative);
        if (fs.existsSync(tscPath)) {
            return tscPath;
        }

        if (/^(\/|[a-z]:[\\/]?)$/i.test(root)) {
            break;
        }

        root = path.dirname(root);
    }
}
