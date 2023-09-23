import * as fs from "node:fs";
import * as path from "node:path";

import { HostContext } from "@ts-perf/core";
import { CommandLineAlias, CommandLineCommand, ParsedCommandLine } from "power-options";

export type CommandExecCallback<TOptions = any> = (
    parsed: ParsedCommandLine<TOptions>,
    host: HostContext,
) => void | Promise<void>;

export interface CommandBase extends CommandLineCommand {
    lock?: boolean;
    update?: boolean;
    commands?: CommandMap;
    exec?: CommandExecCallback<any>;
}

export interface CommandContainer extends CommandBase {
    container: true;
    commands: CommandMap;
    exec?: undefined;
}

export interface AliasCommand extends CommandBase {
    aliasFor: CommandLineAlias;
    exec?: undefined;
}

export interface ExecutableCommand<TOptions = any> extends CommandBase {
    exec: CommandExecCallback<TOptions>;
}

export type Command<TOptions = any> =
    | CommandContainer
    | AliasCommand
    | ExecutableCommand<TOptions>;

export interface CommandMap {
    [command: string]: Command;
}

const commandModulePattern = /^ts-perf-command-(.*)$/;

export function discoverCommands() {
    const commands: CommandMap = {};
    discoverBuiltinCommands(commands);
    discoverInstalledCommands(commands);
    return commands;
}

function discoverBuiltinCommands(commands: CommandMap) {
    const packagesDirectory = path.dirname(path.dirname(__dirname));
    const isDevelopmentBuild = path.basename(packagesDirectory) === "packages";
    const commandsPath = isDevelopmentBuild
        ? path.resolve(packagesDirectory, "commands")
        : require.resolve("@ts-perf/commands", { paths: require.main!.paths });
    const commandModule = require(commandsPath);
    discoverCommandsInModule(commands, commandModule, "commands");
}

function discoverInstalledCommands(commands: CommandMap) {
    let dir = process.cwd();
    while (true) {
        discoverCommandsInPath(commands, path.resolve(dir, "node_modules"), "", true);
        const parent = path.dirname(dir);
        if (!parent || parent === dir) return;
        dir = parent;
    }
}

function discoverCommandsInPath(commands: CommandMap, basedir: string, subdir: string, expandAtNames = false) {
    let names: string[];
    try {
        names = fs.readdirSync(path.resolve(basedir, subdir));
    }
    catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
        throw e;
    }

    for (const name of names) {
        const commandPackageName = path.join(subdir, name);
        if (expandAtNames && name.startsWith("@")) {
            discoverCommandsInPath(commands, basedir, commandPackageName, /*expandAtNames*/ false);
            continue;
        }

        const commandPackagePath = path.resolve(basedir, commandPackageName);
        const commandPackageJson = tryReadPackageJson(commandPackagePath);
        if (
            !commandPackageJson
            || !Array.isArray(commandPackageJson.keywords)
            || !commandPackageJson.keywords.includes("ts-perf-command")
        ) {
            continue;
        }

        try {
            const commandModule = require(commandPackagePath);
            const match = commandModulePattern.exec(commandPackageJson.name || commandPackageName);
            discoverCommandsInModule(commands, commandModule, match ? match[1] : commandPackageName);
        }
        catch {
            continue;
        }
    }
}

// commands come from the default export of the module
function discoverCommandsInModule(commands: CommandMap, commandModule: any, moduleName?: string) {
    if (typeof commandModule.activate !== "function") return;
    commandModule.activate(commands);
    for (const commandName in commands) {
        if (!hasOwn(commands, commandName)) continue;
        if (
            !isExecutableCommand(commands[commandName])
            && !isContainerCommand(commands[commandName])
            && !isAliasCommand(commands[commandName])
        ) {
            throw new TypeError(
                `Module '${moduleName}' registered an invalid command: '${commandName}'. Missing 'exec', 'container', or 'aliasFor'.`,
            );
        }
    }
}

function isExecutableCommand(command: CommandLineCommand): boolean {
    return !command.help && !command.container && !!command.exec;
}

function isContainerCommand(command: CommandLineCommand): boolean {
    return !!command.container && !!command.commands;
}

function isAliasCommand(command: CommandLineCommand): boolean {
    return !!command.aliasFor;
}

const hasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);

function tryReadPackageJson(packagePath: string) {
    const packageJsonPath = path.resolve(packagePath, "package.json");
    try {
        const packageJsonText = fs.readFileSync(packageJsonPath, "utf8");
        const packageJson = JSON.parse(packageJsonText);
        return packageJson;
    }
    catch {
        return undefined;
    }
}
