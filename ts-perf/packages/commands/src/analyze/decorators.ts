import { EOL } from "node:os";

import { Range, TimeSpan } from "@ts-perf/api";
import chalk from "chalk";
import { from } from "iterable-query";
import stripColor from "strip-ansi";
import * as table_style from "table-style";
import { Size, TableColumnDefinition } from "table-style";
import {
    BorderDefinition,
    Color,
    HorizontalAlignment,
    TableCellStyleDefinition,
    TableColumnBorderDefinition,
    TableColumnStyleDefinition,
    TableGroupDefinition,
    TableGroupStyleDefinition,
    TableRowStyleDefinition,
    VerticalAlignment,
} from "table-style/out/lib/types";

const weakTable = new WeakMap<object, Table<any, any>>();

export interface Table<T, C> {
    createContext: (values: readonly T[], limit: number) => C;
    padding?: number;
    width?: number;
    useColor?: boolean;
    group?: TableGroupDefinition<T>[];
    headers?: TableHeader<C>[];
    columns?: TableColumn<T, C>[];
    groupStyles?: TableGroupStyleDefinition<T>[];
    columnStyles?: TableColumnStyleDefinition<T>[];
    rowStyles?: ("*" | TableRowStyleDefinition<T>)[] | "*";
    cellStyles?: TableCellStyleDefinition<T>[];
    border?: BorderDefinition | string;
    align?: HorizontalAlignment;
    verticalAlign?: VerticalAlignment;
    backgroundColor?: Color;
    foregroundColor?: Color;
}

export interface TableHeader<C> {
    expression?: (context: C) => any;
    condition?: (context: C) => boolean;
}

export interface TableColumn<T, C> {
    key?: any;
    header?: string;
    footer?: string;
    width?: number | string | "auto" | Size;
    maxWidth?: number;
    minWidth?: number;
    border?: TableColumnBorderDefinition | string;
    align?: HorizontalAlignment;
    verticalAlign?: VerticalAlignment;
    backgroundColor?: Color;
    foregroundColor?: Color;
    visible?: boolean;
    expression?: (x: T, key: any, context: C) => any;
    condition?: (context: C) => boolean;
}

export function Table<T, C>(definition: Table<T, C>) {
    // eslint-disable-next-line @typescript-eslint/ban-types
    function decorator(constructor: Function) {
        weakTable.set(constructor.prototype, definition);
    }
    return decorator;
}

export namespace Table {
    const singleValueTable: Table<any, any> = {
        createContext: () => null,
        columns: [
            { header: "value", expression: x => x instanceof TimeSpan ? x.toString() : x },
        ],
    };
    interface TableState {
        plainObjectTables?: Map<string, Table<any, any>>;
        complexObjectTables?: Map<object, Table<any, any>>;
    }
    function isSingleValue(value: any) {
        return typeof value !== "object"
            || value === null
            || value instanceof Date
            || value instanceof TimeSpan
            || value instanceof Range;
    }
    function findTableFor(value: any) {
        if (typeof value === "object" && value !== null) {
            value = Object.getPrototypeOf(value);
            while (value) {
                const definition = weakTable.get(value);
                if (definition) return definition;
                value = Object.getPrototypeOf(value);
            }
        }
    }
    function isPlainObject(value: any) {
        const proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }
    function collectKeys(value: any) {
        const keys = new Set<string>();
        while (value) {
            const names = Object.getOwnPropertyNames(value);
            for (const name of names) {
                if (name && name.charAt(0) !== "_" && !keys.has(name)) {
                    const descriptor = Object.getOwnPropertyDescriptor(value, name);
                    if (
                        descriptor
                        && (descriptor.get || "value" in descriptor && typeof descriptor.value !== "function")
                    ) {
                        keys.add(name);
                    }
                }
            }
            value = Object.getPrototypeOf(value);
        }
        return [...keys];
    }
    function createTableFromKeys(keys: string[]): Table<any, any> {
        return {
            createContext: () => null,
            columns: keys.map<TableColumn<any, any>>(key => ({
                key,
                header: key,
                expression: (x, key) => x[key],
            })),
        };
    }
    function getOrCreateTableForPlainObject(state: TableState, value: any) {
        const map = state.plainObjectTables || (state.plainObjectTables = new Map());
        const keys = collectKeys(value);
        const key = JSON.stringify(keys);
        let table = map.get(key);
        if (!table) map.set(key, table = createTableFromKeys(keys));
        return table;
    }
    function getOrCreateTableForComplexObject(state: TableState, value: any) {
        const map = state.plainObjectTables || (state.plainObjectTables = new Map());
        const proto = Object.getPrototypeOf(value);
        let table = map.get(proto);
        if (!table) map.set(proto, table = createTableFromKeys(collectKeys(value)));
        return table;
    }
    function createTableFor(state: TableState, value: unknown) {
        return isSingleValue(value) ? singleValueTable
            : isPlainObject(value) ? getOrCreateTableForPlainObject(state, value)
            : getOrCreateTableForComplexObject(state, value);
    }
    function tableFor(state: TableState, value: unknown) {
        return findTableFor(value) || createTableFor(state, value);
    }
    function formatCore<T, C>(values: readonly T[], table: Table<T, C>, term: TerminalSettings, limit: number) {
        const context = table.createContext(values, limit);
        let output = "";
        if (table.headers) {
            for (const header of table.headers) {
                if ((!header.condition || header.condition(context)) && header.expression) {
                    if (output) output += EOL;
                    output += `${header.expression(context)}`;
                }
            }
            if (!term.useColor) output = stripColor(output);
        }
        if (output) output += EOL;
        let width = table.width;
        if (term.width !== undefined) width = width !== undefined ? Math.min(width, term.width) : term.width;
        const useColor = term.useColor !== false
            && table.useColor !== false
            && (term.useColor || table.useColor);
        output += new table_style.Table<T>({
            useColor,
            padding: table.padding,
            width,
            group: table.group,
            columns: table.columns && table.columns
                .filter(column => !column.condition || column.condition(context))
                .map<TableColumnDefinition<T>>(column => ({
                    key: column.key,
                    header: column.header,
                    footer: column.footer,
                    width: column.width,
                    maxWidth: column.maxWidth,
                    minWidth: column.minWidth,
                    border: column.border,
                    align: column.align,
                    verticalAlign: column.verticalAlign,
                    backgroundColor: column.backgroundColor,
                    foregroundColor: column.foregroundColor,
                    visible: column.visible,
                    expression: column.expression && ((x, key) => column.expression!(x, key, context)),
                })),
            groupStyles: table.groupStyles,
            columnStyles: table.columnStyles,
            rowStyles: table.rowStyles,
            cellStyles: table.cellStyles,
            border: table.border,
            align: table.align,
            verticalAlign: table.verticalAlign,
            backgroundColor: table.backgroundColor,
            foregroundColor: table.foregroundColor,
        }).render(from(values).take(limit));
        if (limit < values.length) {
            let footer = `Only showing ${limit} of ${values.length} values returned.`;
            if (term.useColor) footer = chalk.gray(footer);
            output += footer + EOL;
        }
        return output;
    }
    export function format<T>(values: Iterable<T>, term: TerminalSettings = {}, limit?: number) {
        const state: TableState = {};
        let array: T[] = [];
        let lastTable: Table<T, any> | undefined;
        let output = "";
        let count = 0;
        limit = limit === undefined || limit <= 0 || limit > 1000 ? 1000 : limit;
        for (const value of values) {
            const table = tableFor(state, value);
            if (table !== lastTable) {
                if (count > limit) break;
                if (lastTable) {
                    if (output) output += EOL + EOL;
                    output += formatCore(array, lastTable, term, limit);
                }
                array = [];
                lastTable = table;
            }
            array.push(value);
            count++;
        }
        if (lastTable) {
            if (output) output += EOL;
            output += formatCore(array, lastTable, term, limit);
        }
        return output;
    }
}

export interface TerminalSettings {
    width?: number;
    useColor?: boolean;
}

export function formatValues<T>(values: Iterable<T>, term?: TerminalSettings, limit?: number) {
    return Table.format(values, term, limit);
}
