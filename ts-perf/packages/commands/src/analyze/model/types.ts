import * as fs from "node:fs";
import { REPLServer } from "node:repl";
import { Context, createContext } from "node:vm";

import { delay } from "@esfx/async-delay";
import { CancelSource, CancelToken } from "@esfx/canceltoken";
import { Range, TimeSpan } from "@ts-perf/api";
import chalk from "chalk";
import { fn, from, Query } from "iterable-query";
import { parseAndExecuteQuery, startLinqRepl } from "iterable-query-linq";
import stripColor from "strip-ansi";

import { formatValues } from "../decorators";

export interface HelpInfo {
    types?: Record<string, Type | Alias>;
    tables?: Record<string, Table | Alias>;
    examples?: string[];
}

export interface Type {
    summary?: string;
    description?: string;
    typeParams?: string;
    types?: Record<string, string | Type>;
    constructors?: (string | Signature)[];
    staticProperties?: Record<string, string | Property>;
    properties?: Record<string, string | Property>;
    staticMethods?: Record<string, string | Signature | (string | Signature)[]>;
    methods?: Record<string, string | Signature | (string | Signature)[]>;
    type?: string;
    notes?: string[];
    examples?: string[];
    seeAlso?: Reference[];
}

export interface Property {
    summary?: string;
    type: string;
}

export interface Signature {
    summary?: string;
    signature: string;
}

export interface Parameter {
    name: string;
    type: string;
}

export interface Table {
    summary?: string;
    description?: string;
    type?: string;
    notes?: string[];
    examples?: string[];
    views?: Record<string, View>;
    seeAlso?: Reference[];
}

export interface View {
    summary?: string;
}

export interface Alias {
    alias: string;
}

export type Reference =
    | { type: string; }
    | { table: string; }
    | { link: string; };

export class Analyzer {
    readonly kind: "cpuprofile" | "aggregate";
    readonly context: Context;
    readonly examples: string[] | undefined;
    readonly types: Record<string, Type | Alias>;
    readonly tables: Record<string, Table | Alias>;

    private _formattedTypes: Record<string, string | Alias | undefined> = Object.create(null);
    private _formattedTables: Record<string, string | Alias | undefined> = Object.create(null);
    private _formattedUsage: string | undefined;
    private _typeAndTableNames: TypeAndTableNames | undefined;
    private _realContext: Context | undefined;

    constructor(kind: "cpuprofile" | "aggregate", context: Context, help?: HelpInfo) {
        this.kind = kind;
        this.context = context;
        this.types = Object.create(null, help && help.types ? Object.getOwnPropertyDescriptors(help.types) : {});
        this.tables = Object.create(null, help && help.tables ? Object.getOwnPropertyDescriptors(help.tables) : {});
        this.examples = help && help.examples && help.examples.slice(0);
    }

    addType(name: string, type: Type | Alias = {}) {
        this.types[name] = type;
        this._typeAndTableNames = undefined;
        return this;
    }

    addTable(name: string, table: Table | Alias = {}) {
        this.tables[name] = table;
        this._typeAndTableNames = undefined;
        return this;
    }

    getTypeHelp(name = "", useColors = true) {
        const help = getHelp(this.getTypeAndTableNames(), "type", this.types, this._formattedTypes, name, formatType);
        return useColors ? help : stripColor(help);
    }

    getTableHelp(name = "", useColors = true) {
        const help = getHelp(
            this.getTypeAndTableNames(),
            "table",
            this.tables,
            this._formattedTables,
            name,
            formatTable,
        );
        return useColors ? help : stripColor(help);
    }

    getUsageHelp(useColors = true) {
        const help = this._formattedUsage
            || (this._formattedUsage = formatUsage(this.getTypeAndTableNames(), this.examples));
        return useColors ? help : stripColor(help);
    }

    private getTypeAndTableNames() {
        return this._typeAndTableNames || (this._typeAndTableNames = {
            typeNames: makeNameRegExp(Object.getOwnPropertyNames(this.types)),
            tableNames: makeNameRegExp(Object.getOwnPropertyNames(this.tables)),
        });
    }

    private getContext(): Context {
        if (!this._realContext) {
            this._realContext = createContext({});
            Object.defineProperties(this._realContext, Object.getOwnPropertyDescriptors(this.context));
            Object.defineProperties(
                this._realContext,
                Object.getOwnPropertyDescriptors({
                    Query,
                    from,
                    fn,
                    TimeSpan,
                    Range,
                    chalk,
                    format: (value: any, limit = 50) =>
                        formatValues(value && Symbol.iterator in value ? value : [value], { useColor: true }, limit),
                }),
            );
        }
        return this._realContext;
    }

    analyze(queryString: string, limit: number, useColor: boolean) {
        const query = parseAndExecuteQuery(queryString, this.getContext());
        const width = process.stdout.columns ? process.stdout.columns - 2 : undefined;
        process.stdout.write(`${formatValues(query, { width, useColor }, limit)}\n`);
    }

    async startRepl(limit: number, useColors: boolean, replHistoryPath: string) {
        const initialLimit = limit;
        const width = process.stdout.columns ? process.stdout.columns - 2 : undefined;
        process.stdout.write(`jsql repl - Use linq syntax and JavaScript expressions\n`);
        process.stdout.write(`for more information use: .help, .usage, .table, .type\n`);
        const repl = startLinqRepl(this.getContext(), {
            useColors,
            async: false,
            writer: query => formatValues(query, { width, useColor: useColors }, limit),
        });
        repl.defineCommand("type", {
            help: "Get help for a type",
            action: text => {
                repl.clearBufferedCommand();
                repl.outputStream.write(`${this.getTypeHelp(text.trim())}`);
                repl.displayPrompt();
            },
        });
        repl.defineCommand("table", {
            help: "Get help for a table/view",
            action: text => {
                repl.clearBufferedCommand();
                repl.outputStream.write(`${this.getTableHelp(text.trim())}`);
                repl.displayPrompt();
            },
        });
        repl.defineCommand("usage", {
            help: "Get jsql/linq usage examples",
            action: () => {
                repl.clearBufferedCommand();
                repl.outputStream.write(`${this.getUsageHelp()}`);
                repl.displayPrompt();
            },
        });
        repl.defineCommand("limit", {
            help: "Sets a limit on the number of results returned",
            action: (text: string) => {
                repl.clearBufferedCommand();
                text = text.trim();
                if (!text) {
                    repl.outputStream.write(limit + "\n");
                }
                else {
                    const newLimit = parseInt(text, 10);
                    if (isFinite(newLimit)) limit = newLimit;
                }
                repl.displayPrompt();
            },
        });
        repl.on("reset", () => {
            limit = initialLimit;
        });
        await configureReplHistory(repl, replHistoryPath);
        await new Promise<void>(resolve => repl.on("exit", () => resolve()));
    }
}

async function readReplHistory(repl: REPLServer, replHistoryPath: string) {
    const data = await fs.promises.readFile(replHistoryPath, "utf8");
    repl.history = data ? data.split(/[\r\n]/g, repl.historySize).filter(line => !!line.trim()) : [];
}

async function writeReplHistory(repl: REPLServer, replHistoryPath: string) {
    try {
        const history = repl.history.join("\n");
        await fs.promises.writeFile(replHistoryPath, history, "utf8");
    }
    catch {
    }
}

async function configureReplHistory(repl: REPLServer, replHistoryPath: string) {
    repl.pause();
    try {
        if (replHistoryPath) replHistoryPath = replHistoryPath.trim();
        if (!replHistoryPath) return;

        const handle = await fs.promises.open(replHistoryPath, "a+", 0o600);
        await handle.close();
        await readReplHistory(repl, replHistoryPath);

        const onLine = () => {
            flushHistory(/*debounce*/ false);
        };

        const onExit = () => {
            repl.removeListener("line", onLine);
            if (source) source.cancel();
            source = undefined;
        };

        let source: CancelSource | undefined;
        let writing = false;
        let writeRequested = false;

        repl.on("line", onLine);
        repl.on("exit", onExit);

        await flushHistory(/*debounce*/ false);

        async function flushHistory(debounce: boolean) {
            do {
                writeRequested = false;

                if (debounce) {
                    if (source) source.cancel();
                    source = CancelToken.source();
                    try {
                        await delay(source.token, 15);
                    }
                    catch {
                        break;
                    }
                }

                source = undefined;
                if (writing) {
                    writeRequested = true;
                }
                else {
                    writing = true;
                    await writeReplHistory(repl, replHistoryPath);
                    writing = false;
                }
            }
            while (writeRequested && debounce);

            if (writeRequested) {
                flushHistory(/*debounce*/ true);
            }
            else {
                if (!source) {
                    repl.emit("flushHistory");
                }
            }
        }
    }
    catch {
        repl.outputStream.write("Error: could not open history file.\n");
    }
    finally {
        repl.resume();
    }
}

export class AggregateAnalyzer extends Analyzer {
    constructor(analyzers: Analyzer[]) {
        const context = {};
        const helpInfo: HelpInfo = {};
        helpInfo.types = {};
        helpInfo.tables = {};
        helpInfo.examples = [];
        const kinds = new Set<string>();
        for (const analyzer of analyzers) {
            if (analyzer.kind === "aggregate") throw new Error("Cannot aggregate an AggregateAnalyzer");
            if (kinds.has(analyzer.kind)) throw new Error("Cannot analyze multiple files of the same kind");
            kinds.add(analyzer.kind);
            Object.defineProperties(context, Object.getOwnPropertyDescriptors(analyzer.context));
            Object.defineProperties(helpInfo.types, Object.getOwnPropertyDescriptors(analyzer.types));
            Object.defineProperties(helpInfo.tables, Object.getOwnPropertyDescriptors(analyzer.tables));
            if (analyzer.examples) helpInfo.examples = helpInfo.examples.concat(analyzer.examples);
        }
        createContext(context);
        super("aggregate", context, helpInfo);
    }
}

function isAlias(value: any): value is Alias {
    return typeof value === "object" && value !== null && "alias" in value;
}

interface TypeAndTableNames {
    typeNames: RegExp;
    tableNames: RegExp;
}

function getHelp<T extends Type | Table>(
    typeAndTableNames: TypeAndTableNames,
    kind: "table" | "type",
    entries: Record<string, T | Alias>,
    formattedEntries: Record<string, string | Alias | undefined>,
    name: string,
    formatEntry: (typeAndTableNames: TypeAndTableNames, name: string, entry: T) => string,
): string {
    let helpTopic = name;
    while (true) {
        const formattedEntry = formattedEntries[helpTopic];
        if (formattedEntry === undefined) {
            const entry = entries[helpTopic];
            if (!entry) {
                if (helpTopic === "") return formattedEntries[""] = formatEntries(typeAndTableNames, kind, entries);
                const defaultHelp = getHelp(typeAndTableNames, kind, entries, formattedEntries, "", formatEntry);
                return `${chalk.red("ERR!")} Help topic '${helpTopic}' not found.\n\n${defaultHelp}`;
            }
            else if (isAlias(entry)) {
                formattedEntries[helpTopic] = entry;
                helpTopic = entry.alias;
            }
            else {
                return formattedEntries[helpTopic] = formatEntry(typeAndTableNames, helpTopic, entry);
            }
        }
        else if (isAlias(formattedEntry)) {
            helpTopic = formattedEntry.alias;
        }
        else {
            return formattedEntry;
        }
    }
}

function formatEntries<T extends Type | Table>(
    typeAndTableNames: TypeAndTableNames,
    kind: "type" | "table",
    entries: Record<string, T | Alias>,
) {
    let s = `Related help topics (use '.${kind} <name>' for more information):\n`;
    const keys = Object.getOwnPropertyNames(entries);
    const len = keys.reduce((len, key) => Math.max(len, key.length), 0);
    const color = kind === "type" ? chalk.cyan : chalk.magenta;
    for (const key of keys) {
        const entry = entries[key];
        if (!isAlias(entry)) {
            s += `  ${chalk.white(`.${kind}`)} ${
                entry.summary ? `${color(key.padEnd(len))}  ${formatOther(typeAndTableNames, entry.summary)}`
                    : color(key)
            }\n`;
        }
    }
    return s;
}

function formatType(typeAndTableNames: TypeAndTableNames, name: string, type: Type) {
    let s = "";
    s += formatHeader(typeAndTableNames, chalk.cyan(name), type.summary, type.description, type.typeParams);
    s += formatNestedTypes(typeAndTableNames, type.types);
    s += formatConstructors(typeAndTableNames, type.constructors);
    s += formatProperties(typeAndTableNames, "static properties", type.staticProperties);
    s += formatProperties(typeAndTableNames, "properties", type.properties);
    s += formatMethods(typeAndTableNames, "static methods", type.staticMethods);
    s += formatMethods(typeAndTableNames, "methods", type.methods);
    s += formatTypeAlias(typeAndTableNames, type.type);
    s += formatNotes(typeAndTableNames, type.notes);
    s += formatExamples(typeAndTableNames, type.examples);
    s += formatSeeAlso(typeAndTableNames, type.seeAlso);
    return s;
}

function formatTable(typeAndTableNames: TypeAndTableNames, name: string, table: Table) {
    let s = "";
    s += formatHeader(typeAndTableNames, chalk.magenta(name), table.summary, table.description);
    s += formatTypeAlias(typeAndTableNames, table.type);
    s += formatNotes(typeAndTableNames, table.notes);
    s += formatExamples(typeAndTableNames, table.examples);
    s += formatViews(typeAndTableNames, table.views);
    s += formatSeeAlso(typeAndTableNames, table.seeAlso);
    return s;
}

function formatUsage(typeAndTableNames: TypeAndTableNames, examples: string[] | undefined) {
    let s = "";
    s += formatNotes(typeAndTableNames, [
        `  This repl uses linq syntax ('from', 'let', 'where', 'orderby', 'select', 'group', 'join')
  and a subset of JavaScript expression syntax. Statements, classes, functions, methods
  and accessors are not supported (other than expression-bodied arrow functions).`,
    ]);
    s += formatExamples(typeAndTableNames, examples);
    s += formatSeeAlso(typeAndTableNames, [{ link: "https://github.com/rbuckton/iterable-query-linq#readme" }]);
    return s;
}

function formatHeader(
    typeAndTableNames: TypeAndTableNames,
    name: string,
    summary?: string,
    description?: string,
    typeParams?: string,
) {
    let s = name;
    if (typeParams) s += typeParams;
    if (summary) s += ` - ${formatOther(typeAndTableNames, summary)}`;
    s += `\n\n`;
    if (description) s += `${formatOther(typeAndTableNames, description.trim())}\n\n`;
    return s;
}

function formatNotes(typeAndTableNames: TypeAndTableNames, notes: string[] | undefined) {
    let s = "";
    if (notes && notes.length) {
        for (const note of notes) {
            s += `${chalk.bold("note:")}\n`;
            s += `${formatOther(typeAndTableNames, note)}\n\n`;
        }
    }
    return s;
}

function getProperty(property: string | Property): Property {
    return typeof property === "string" ? { type: property } : property;
}

function getProperties(propertiesRecord: Record<string, string | Property> | undefined) {
    return propertiesRecord
        && Object.entries(propertiesRecord).map(([key, property]) =>
            [key, getProperty(property)] as [string, Property]
        );
}

function formatProperties(
    typeAndTableNames: TypeAndTableNames,
    header: string,
    propertiesRecord: Record<string, string | Property> | undefined,
) {
    let s = "";
    const properties = getProperties(propertiesRecord);
    if (properties && properties.length) {
        const len = properties.reduce((len, [key, value]) => Math.max(len, key.length + value.type.length + 2), 0);
        for (const [key, property] of properties) {
            s += `  ${key}: ${
                formatOther(
                    typeAndTableNames,
                    property.summary ? `${property.type.padEnd(len - key.length - 2)}  ${property.summary}`
                        : property.type,
                )
            }\n`;
        }
    }
    return s && `${chalk.bold(`${header}:`)}\n${s}\n`;
}

function getSignature(signature: string | Signature) {
    return typeof signature === "string" ? { signature } : signature;
}

function getSignatures(signatures: string | Signature | (string | Signature)[]) {
    return Array.isArray(signatures) ? signatures.map(getSignature) : [getSignature(signatures)];
}

function getMethods(methodsRecord: Record<string, string | Signature | (string | Signature)[]> | undefined) {
    return methodsRecord
        && Object.entries(methodsRecord).map(([key, signature]) =>
            [key, getSignatures(signature)] as [string, Signature[]]
        );
}

function formatMethods(
    typeAndTableNames: TypeAndTableNames,
    header: string,
    methodsRecord: Record<string, string | Signature | (string | Signature)[]> | undefined,
) {
    let s = "";
    const methods = getMethods(methodsRecord);
    if (methods && methods.length) {
        for (const [key, method] of methods) {
            s += formatSignatures(typeAndTableNames, key, method, !s);
        }
    }
    return s && `${chalk.bold(`${header}:`)}\n${s}\n`;
}

function formatConstructors(
    typeAndTableNames: TypeAndTableNames,
    constructors: string | Signature | (string | Signature)[] | undefined,
) {
    let s = "";
    if (constructors) s += formatSignatures(typeAndTableNames, "constructor", getSignatures(constructors));
    return s && `${chalk.bold("constructors:")}\n${s}\n`;
}

function formatSignatures(typeAndTableNames: TypeAndTableNames, key: string, signatures: Signature[], first = true) {
    let s = "";
    for (const signature of signatures) {
        if (signature.summary) {
            if (!first) s += `\n`;
            s += `  ${chalk.gray(`// ${formatOther(typeAndTableNames, signature.summary)}`)}\n`;
        }
        s += `  ${key}${formatOther(typeAndTableNames, signature.signature)}\n`;
    }
    return s;
}

function getType(type: string | Type): Type {
    return typeof type === "string" ? { type } : type;
}

function getTypes(typesRecord: Record<string, string | Type> | undefined) {
    return typesRecord && Object.entries(typesRecord).map(([key, type]) => [key, getType(type)] as [string, Type]);
}

function formatNestedTypes(
    typeAndTableNames: TypeAndTableNames,
    typesRecord: Record<string, string | Type> | undefined,
) {
    let s = "";
    const types = getTypes(typesRecord);
    if (types && types.length > 0) {
        for (const [key, type] of types) {
            s += `  ${chalk.cyan(key)}${type.type ? `: ${formatOther(typeAndTableNames, type.type)}` : ``}\n`;
        }
    }
    return s && `${chalk.bold("nested types:")}\n${s}\n`;
}

function formatTypeAlias(typeAndTableNames: TypeAndTableNames, type: string | undefined) {
    return type ? `${chalk.bold("type:")}\n  ${formatOther(typeAndTableNames, type)}\n\n` : "";
}

function formatExamples(typeAndTableNames: TypeAndTableNames, examples: string[] | undefined) {
    let s = "";
    if (examples && examples.length) {
        for (const example of examples) {
            s += `\n${chalk.gray(example)}\n`;
        }
    }
    return s && `${chalk.bold("examples:")}\n${s}\n`;
}

function formatViews(typeAndTableNames: TypeAndTableNames, viewsRecord: Record<string, View> | undefined) {
    let s = "";
    const views = viewsRecord && Object.entries(viewsRecord);
    if (views && views.length) {
        const len = views.reduce((len, [key]) => Math.max(len, key.length), 0);
        for (const [key, view] of views) {
            s += `  ${
                view.summary ? `${chalk.yellow(key.padEnd(len))}  ${formatOther(typeAndTableNames, view.summary)}`
                    : chalk.yellow(key)
            }\n`;
        }
    }
    return s && `${chalk.bold("views:")}\n${s}\n`;
}

function formatSeeAlso(typeAndTableNames: TypeAndTableNames, seeAlso: Reference[] | undefined) {
    let s = "";
    if (seeAlso && seeAlso.length) {
        for (const reference of seeAlso) {
            s += "type" in reference ? `  ${chalk.white(".type")} ${chalk.cyan(reference.type)}\n`
                : "table" in reference ? `  ${chalk.white(".table")} ${chalk.magenta(reference.table)}\n`
                : `  ${chalk.cyan(chalk.underline(reference.link))}\n`;
        }
    }
    return s && `${chalk.bold("see also:")}\n${s}\n`;
}

const keywords = makeNameRegExp([
    "string",
    "number",
    "boolean",
    "unique symbol",
    "symbol",
    "null",
    "undefined",
    "any",
    "unknown",
    "never",
]);

function formatOther(typeAndTableNames: TypeAndTableNames, text: string) {
    text = text.replace(typeAndTableNames.typeNames, name => chalk.cyan(name));
    text = text.replace(typeAndTableNames.tableNames, name => chalk.magenta(name));
    text = text.replace(keywords, name => chalk.blue(name));
    return text;
}

function makeNameRegExp(names: string[]) {
    return new RegExp(`\\b(${names.join("|")})\\b`, "g");
}

// TODO: add to node definitions
declare module "readline" {
    interface Interface {
        history: string[];
        historySize: number;
    }
}
