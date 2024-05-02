import * as fs from "node:fs";
import * as path from "node:path";

import { localSuiteDirectory } from "@ts-perf/core";
import { CommandLineOption, CommandLineOptionSet, CommandLineOptionSets, CommandLineParseError } from "power-options";

export interface CommonOptions {
    scenarioDirs?: string[];
}

export interface CompilerOptions extends CommonOptions {
    builtDir: string;
    suiteDir: string;
    compilerOptions?: string[];
}

export interface TSServerOptions extends CommonOptions {
    builtDir: string;
    suiteDir: string;
    extended: boolean;
}

export interface StartupOptions extends CommonOptions {
    builtDir: string;
}

const suiteDir: CommandLineOption = {
    type: "string",
    alias: "suite",
    validate: validatePath,
    defaultValue() {
        const suite = findPath(process.env.TSPERF_SUITE_DIR, /*relative*/ undefined, /*walkUpParents*/ false)
            || findPath(localSuiteDirectory, /*relative*/ undefined, /*walkUpParents*/ false);
        if (!suite) {
            throw new CommandLineParseError(
                `Could not resolve the path to the test suite (i.e. './cases/solutions'). Try specifying '--suiteDir'.`,
            );
        }
        return suite;
    },
    param: "directory",
    description:
        "Use <directory> as the root location for test suites (i.e. './cases/solutions'). If not set, uses TSPERF_SUITE_DIR environment variable, if found. Otherwise, uses '~/.tsperf/solutions', if present.",
};

const scenarioDirs: CommandLineOption = {
    type: "string",
    longName: "scenarioDir",
    alias: ["scenarioDirs", "scenarioConfigDir", "scenarioConfigDirs"],
    multiple: true,
    validate: validatePath,
    defaultValue() {
        const dirs = process.env.TSPERF_SCENARIO_DIRS?.split(path.delimiter)
            .map(dirname => findPath(dirname, /*relative*/ undefined, /*walkUpParents*/ false))
            .filter((dirname): dirname is string => !!dirname);
        return dirs;
    },
    param: "directory",
    description:
        "Use <directory> as a location containing individual test scenario folders each with a 'scenario.json'. If not set, uses TSPERF_SCENARIO_DIRS environment variable, if found. '~/.tsperf/solutions' will always be included, if present.",
};

const builtDir: CommandLineOption = {
    type: "string",
    validate: validatePath,
    defaultValue() {
        const builtDir = findPath(process.env.TSPERF_BUILT_DIR, /*relative*/ undefined, /*walkUpParents*/ false)
            || findPath(process.cwd(), "./built/local", /*walkUpParents*/ true)
            || findPath(process.env.TYPESCRIPT_REPOSITORY, "./built/local", /*walkUpParents*/ false);
        if (!builtDir) {
            throw new CommandLineParseError(
                `Could not resolve the path to the built directory (i.e. './built/local'). Try specifying '--builtDir'.`,
            );
        }
        return builtDir;
    },
    param: "directory",
    description:
        "Use <directory> as the built local dir (i.e. './built/local'). If not set, uses TSPERF_BUILT_DIR environment variable, if found. Otherwise, walks up from the current directory looking for './built/local'",
};

const common: CommandLineOptionSet = {
    merge: true,
    options: {
        scenarioDirs,
    },
};

const compiler: CommandLineOptionSet = {
    merge: true,
    include: ["common"],
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
    include: ["common"],
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
    include: ["common"],
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
                "Azure storage account when using blob storage. If not set, uses TSPERF_AZURE_STORAGE_ACCOUNT environment variable, if found.",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_ACCOUNT,
        },
        azureStorageContainer: {
            type: "string",
            param: "container",
            description:
                "Container to use when using blob storage. If not set, uses TSPERF_AZURE_STORAGE_CONTAINER environment variable, if found.",
            defaultValue: () => process.env.TSPERF_AZURE_STORAGE_CONTAINER,
        },
    },
};

export const optionSets: CommandLineOptionSets = {
    common,
    compiler,
    tsserver,
    startup,
    azureStorage,
};

function validatePath(values: string | string[], arg: string) {
    for (const value of Array.isArray(values) ? values : [values]) {
        if (!fs.existsSync(value)) {
            throw new CommandLineParseError(`Option '${arg}' path not found: '${value}'.`);
        }
    }
}

function findPath(dirname: string | undefined, relative: string | undefined, walkUpParents: boolean) {
    if (dirname) {
        dirname = path.resolve(dirname);
        while (dirname) {
            const candidate = relative ? path.resolve(dirname, relative) : dirname;
            if (fs.existsSync(candidate)) {
                return candidate;
            }

            if (!walkUpParents) {
                break;
            }

            if (/^(\/|[a-z]:[\\/]?)$/i.test(dirname)) {
                break;
            }

            dirname = path.dirname(dirname);
        }
    }
    else if (relative && path.isAbsolute(relative)) {
        relative = path.resolve(relative);
        if (fs.existsSync(relative)) {
            return relative;
        }
    }
}
