import * as fs from "node:fs";
import * as path from "node:path";

import { CommandLineOption, CommandLineOptionSet, CommandLineOptionSets, CommandLineParseError } from "power-options";

export interface CompilerOptions {
    builtDir: string;
    suiteDir: string;
    compilerOptions?: string[];
}

export interface TSServerOptions {
    builtDir: string;
    suiteDir: string;
    extended: boolean;
}

export interface StartupOptions {
    builtDir: string;
}

const suiteDir: CommandLineOption = {
    type: "string",
    alias: "suite",
    validate: validatePath,
    defaultValue() {
        const suite = findPath(__dirname, "./cases/solutions");
        if (!suite) {
            throw new CommandLineParseError(
                `Could not resolve the path to the test suite (i.e. './cases/solutions'). Try specifying '--suiteDir'.`,
            );
        }
        return suite;
    },
    param: "directory",
    description: "Use <directory> as the root location for test suites (i.e. './cases/solutions'). If not set, uses TSPERF_SUITE_DIR environment variable, if found. Otherwise, uses '~/.tsperf/solutions', if present.",
};

const builtDir: CommandLineOption = {
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
};

const compiler: CommandLineOptionSet = {
    merge: true,
    options: {
        builtDir,
        suiteDir,
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
        builtDir,
        suiteDir,
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
        builtDir,
        suiteDir,
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
        azureStorageAccount: {
            type: "string",
            param: "name",
            description:
                "Azure storage account when using blob storage (uses TSPERF_AZURE_STORAGE_ACCOUNT environment variable if found).",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_ACCOUNT!,
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
