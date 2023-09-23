export interface TSServerConfig {
    /**
     * Name of the solution to be tested, e.g.'xstate'.
     */
    solution: string;
    commands: TSServerCommands;
}

type TSServerCommands = [
    TSServerUpdateOpenCommand,
    TSServerGeterrCommand,
    TSServerReferencesCommand,
    TSServerNavtoCommand,
    TSServerCompletionInfoCommand,
    ...TSServerCommand[], // Extended commands - not part of basic suite
];

interface TSServerCommandBase {
    commandName: TSServerCommandName;
    args: object;
}

export type TSServerCommandName =
    | "updateOpen"
    | "geterr"
    | "references"
    | "navto"
    | "completionInfo";

export type TSServerCommand =
    | TSServerUpdateOpenCommand
    | TSServerGeterrCommand
    | TSServerReferencesCommand
    | TSServerNavtoCommand
    | TSServerCompletionInfoCommand;

export interface TSServerUpdateOpenCommand extends TSServerCommandBase {
    commandName: "updateOpen";
    args: FileArg[];
}

export interface TSServerGeterrCommand extends TSServerCommandBase {
    commandName: "geterr";
    args: File[];
}

export interface TSServerReferencesCommand extends TSServerCommandBase {
    commandName: "references";
    args: FilePos;
}

export interface TSServerNavtoCommand extends TSServerCommandBase {
    commandName: "navto";
    args: {
        searchValue: string;
    };
}

export interface TSServerCompletionInfoCommand extends TSServerCommandBase {
    commandName: "completionInfo";
    args: FilePos;
}

type File = string;
interface FileArg {
    file: File;
}
interface FilePos {
    file: File;
    line: number;
    /**
     * Position's character index into line
     */
    offset: number;
}
