import * as fs from "node:fs";

import { HostContext } from "@ts-perf/core";
import { Timeline } from "@ts-perf/inspector";
import chalk from "chalk";

import { Analyzer } from "../types";
import { createCpuProfileContext } from "./context";
import { CpuProfile } from "./profile";

export async function createProfileAnalyzer(file: string, includeNatives: boolean, host: HostContext) {
    const timeline = Timeline.parse(await fs.promises.readFile(file, "utf8"));
    const profile = new CpuProfile(timeline, { includeNatives, host });
    const context = createCpuProfileContext(profile);
    return new Analyzer("cpuprofile", context, {
        types: {
            CpuProfile: {
                summary: "A v8 CPU profile",
                properties: {
                    startTime: { type: "TimeSpan" },
                    endTime: { type: "TimeSpan" },
                    duration: { type: "TimeSpan" },
                    head: { type: "CpuProfileNode" },
                    samples: { type: "number[]" },
                    timestamps: { type: "TimeSpan[]" },
                    totalCount: { type: "number" },
                    averageSampleDuration: { type: "TimeSpan" },
                    events: { type: "CpuProfileEvents" },
                    functionsView: { type: "CpuProfileView" },
                    filesView: { type: "CpuProfileView" },
                    categoriesView: { type: "CpuProfileView" },
                },
                methods: {
                    getTimestamps: { signature: "(id: number): TimeSpan[]" },
                    getNode: { signature: "(id: number): CpuProfileNode" },
                    nodes: { signature: "(): HierarchyQuery<CpuProfileNode>" },
                    slice: { signature: "(ranges: Range<TimeSpan>[]): CpuProfileView" },
                    aggregate: {
                        signature:
                            "(keySelector: (node: CpuProfileNode) => string, ranges?: Range<TimeSpan>[]): CpuProfileView",
                    },
                },
                seeAlso: [
                    { type: "CpuProfileNode" },
                    { type: "CpuProfileView" },
                    { type: "CpuProfileEvents" },
                    { type: "TimeSpan" },
                    { type: "Range" },
                    { type: "HierarchyQuery" },
                ],
            },
            CpuProfileNode: {
                summary: "A raw profiler node.",
                properties: {
                    id: { type: "number", summary: "The id of the node" },
                    functionName: { type: "string", summary: "The name of the function" },
                    scriptId: { type: "string", summary: "The v8's id for the script" },
                    url: { type: "string", summary: "The url associated with the script" },
                    lineNumber: { type: "number", summary: "The line for the start of the function (0-based)" },
                    columnNumber: { type: "number", summary: "The column for the start of the function (0-based)" },
                    location: {
                        type: "string",
                        summary: "The formatted url, line, and column for the function (1-based)",
                    },
                    bailoutReason: { type: "string", summary: "The reason for a deoptimization" },
                    selfCount: {
                        type: "number",
                        summary: "The number of samples where this node was on top of the call stack",
                    },
                    totalCount: {
                        type: "number",
                        summary: "The number of samples where this node was anywhere in the call stack",
                    },
                    startTime: { type: "TimeSpan", summary: "The first time a sample was recorded for the node" },
                    endTime: { type: "TimeSpan", summary: "The last time a sample was recorded for the node" },
                    selfTime: {
                        type: "TimeSpan",
                        summary: "The estimated time this node was on top of the call stack",
                    },
                    totalTime: {
                        type: "TimeSpan",
                        summary: "The estimated time this node was anywhere in the call stack",
                    },
                    isNativeCode: { type: "boolean", summary: "Indicates whether the node represents native code" },
                    isProfilerCode: { type: "boolean", summary: "Indicates whether the node represents profiler code" },
                    isNodeCode: { type: "boolean", summary: "Indicates whether the node represents NodeJS code" },
                    isSystemCode: { type: "boolean", summary: "Indicates whether the node represents v8 code" },
                    isUserCode: { type: "boolean", summary: "Indicates whether the node represents user code" },
                    categories: { type: "Category[]", summary: "The categories for the node" },
                    lines: {
                        type: "CpuProfileLineTick[]",
                        summary: "The ticks (number of samples) recorded per line of the function",
                    },
                    parent: { type: "CpuProfileNode", summary: "The parent profile node for this node" },
                    profile: { type: "CpuProfile", summary: "The profile to which this node belongs" },
                },
                methods: {
                    hasCategory: {
                        signature: "(category: Category | string): boolean",
                        summary: "Whether the node belongs to the provided category.",
                    },
                    occursWithin: {
                        signature: "(ranges: Range<TimeSpan>[]): boolean",
                        summary: "Whether the node has samples that occur within any of a series of ranges.",
                    },
                    slice: {
                        signature: "(ranges: Range<TimeSpan>[]): CpuProfileNodeView | undefined",
                        summary: "Gets a view of this node that occurs within the supplied ranges.",
                    },
                    aggregate: {
                        signature:
                            "(keySelector: (node: CpuProfileNode) => string, ranges?: Range<TimeSpan>[]): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets an aggregated view of this nodes using the supplied selector",
                    },
                    ancestors: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the ancestors of this node",
                    },
                    ancestorsAndSelf: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the ancestors and self of this node",
                    },
                    children: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the children of this node",
                    },
                    siblings: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the siblings of this node",
                    },
                    siblingsAndSelf: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the siblings and self of this node",
                    },
                    descendants: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the descendants of this node",
                    },
                    descendantsAndSelf: {
                        signature: "(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode>",
                        summary: "Gets a HierarchyQuery for the descendands and self of this node",
                    },
                },
                seeAlso: [
                    { type: "CpuProfileLineTick" },
                    { type: "CpuProfile" },
                    { type: "CpuProfileNodeView" },
                    { type: "Category" },
                    { type: "Range" },
                    { type: "TimeSpan" },
                    { type: "HierarchyQuery" },
                ],
            },
            CpuProfileLineTick: {
                summary: "Source position ticks.",
                properties: {
                    lineNumber: { type: "number" },
                    ticks: { type: "number" },
                    duration: { type: "TimeSpan" },
                    location: { type: "string" },
                    node: { type: "CpuProfileNode" },
                    profile: { type: "CpuProfile" },
                },
                seeAlso: [
                    { type: "CpuProfileNode" },
                    { type: "CpuProfile" },
                    { type: "TimeSpan" },
                ],
            },
            CpuProfileView: {
                summary: "An aggregate view over a CpuProfile.",
                properties: {
                    startTime: { type: "TimeSpan" },
                    endTime: { type: "TimeSpan" },
                    duration: { type: "TimeSpan" },
                    totalCount: { type: "number" },
                    head: { type: "CpuProfileNodeView" },
                    ranges: { type: "Range<TimeSpan>[]" },
                    name: { type: "string" },
                    profile: { type: "CpuProfile" },
                },
                methods: {
                    contains: { signature: "(node: CpuProfileNode): boolean" },
                    filterNodes: { signature: "(node: Iterable<CpuProfileNode>): Iterable<CpuProfileNode>" },
                    filterTimestamps: { signature: "(timestamps: Iterable<TimeSpan>): Iterable<TimeSpan>" },
                    sameKey: { signature: "(left: CpuProfileNodeView, right: CpuProfileNodeView): boolean" },
                    keyFor: { signature: "(node: CpuProfileNode): string" },
                    slice: { signature: "(ranges: Range<TimeSpan>[]): CpuProfileView" },
                    aggregate: {
                        signature:
                            "(keySelector: (node: CpuProfileNode) => string, ranges: Range<TimeSpan>[]): CpuProfileView",
                    },
                    viewFor: { signature: "(node: CpuProfileNode): CpuProfileNodeView" },
                    viewsfor: { signature: "(nodes: Iterable<CpuProfileNode>): Iterable<CpuProfileNodeView>" },
                    viewForKey: { signature: "(viewKey: string): CpuProfileNodeView" },
                },
                seeAlso: [
                    { type: "CpuProfileNodeView" },
                    { type: "CpuProfileNode" },
                    { type: "CpuProfile" },
                    { type: "Range" },
                    { type: "TimeSpan" },
                ],
            },
            CpuProfileNodeView: {
                summary: "An aggregated view of one or more profiler nodes.",
                properties: {
                    functionName: { type: "string", summary: "The name of the function." },
                    scriptId: { type: "string", summary: "The v8's id for the script." },
                    url: { type: "string", summary: "The url associated with the script." },
                    lineNumber: { type: "number", summary: "The line for the start of the function (0-based)." },
                    columnNumber: { type: "number", summary: "The column for the start of the function (0-based)." },
                    location: {
                        type: "string",
                        summary: "The formatted url, line, and column for the function (1-based).",
                    },
                    bailoutReason: { type: "string", summary: "The reason for a deoptimization." },
                    selfCount: {
                        type: "number",
                        summary: "The number of samples where this node was on top of the call stack.",
                    },
                    totalCount: {
                        type: "number",
                        summary: "The number of samples where this node was anywhere in the call stack.",
                    },
                    startTime: { type: "TimeSpan", summary: "The first time a sample was recorded for the node." },
                    endTime: { type: "TimeSpan", summary: "The last time a sample was recorded for the node." },
                    selfTime: {
                        type: "TimeSpan",
                        summary: "The estimated time this node was on top of the call stack.",
                    },
                    totalTime: {
                        type: "TimeSpan",
                        summary: "The estimated time this node was anywhere in the call stack.",
                    },
                    isNativeCode: { type: "boolean", summary: "Indicates whether the node represents native code." },
                    isProfilerCode: {
                        type: "boolean",
                        summary: "Indicates whether the node represents profiler code.",
                    },
                    isNodeCode: { type: "boolean", summary: "Indicates whether the node represents NodeJS code." },
                    isSystemCode: { type: "boolean", summary: "Indicates whether the node represents v8 code." },
                    isUserCode: { type: "boolean", summary: "Indicates whether the node represents user code." },
                    categories: { type: "Category[]", summary: "The categories for the node." },
                    lines: {
                        type: "CpuProfileLineTickView[]",
                        summary: "The ticks (number of samples) recorded per line of the function.",
                    },
                    nodes: { type: "CpuProfileNode[]", summary: "The raw profile nodes for this node." },
                    parent: { type: "CpuProfileNodeView", summary: "The parent profile node for this node." },
                    profileView: {
                        type: "CpuProfileView",
                        summary: "The view of the profile to which this node belongs.",
                    },
                    profile: { type: "CpuProfile", summary: "The profile to which this node belongs." },
                },
                methods: {
                    hasCategory: {
                        signature: "(category: Category | string): boolean",
                        summary: "Whether the node belongs to the provided category.",
                    },
                    occursWithin: {
                        signature: "(ranges: Range<TimeSpan>[]): boolean",
                        summary: "Whether the node has samples that occur within any of a series of ranges.",
                    },
                    slice: {
                        signature: "(ranges: Range<TimeSpan>[]): CpuProfileNodeView | undefined",
                        summary: "Gets the slice of the original nodes that occur within the supplied ranges.",
                    },
                    aggregate: {
                        signature:
                            "(keySelector: (node: CpuProfileNode) => string, ranges?: Range<TimeSpan>[]): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a different view of the aggregated nodes using a different selector",
                    },
                    ancestors: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the ancestors of this node",
                    },
                    ancestorsAndSelf: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the ancestors and self of this node",
                    },
                    children: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the children of this node",
                    },
                    siblings: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the siblings of this node",
                    },
                    siblingsAndSelf: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the siblings and self of this node",
                    },
                    descendants: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the descendants of this node",
                    },
                    descendantsAndSelf: {
                        signature:
                            "(predicate?: (node: CpuProfileNodeView) => boolean): HierarchyQuery<CpuProfileNodeView>",
                        summary: "Gets a HierarchyQuery for the descendands and self of this node",
                    },
                },
                seeAlso: [
                    { type: "CpuProfileLineTickView" },
                    { type: "CpuProfileNode" },
                    { type: "CpuProfileView" },
                    { type: "CpuProfile" },
                    { type: "Category" },
                    { type: "Range" },
                    { type: "TimeSpan" },
                    { type: "HierarchyQuery" },
                ],
            },
            CpuProfileLineTickView: {
                summary: "An aggregate view of source position ticks.",
                properties: {
                    lineNumber: { type: "number" },
                    ticks: { type: "number" },
                    duration: { type: "TimeSpan" },
                    location: { type: "string" },
                    lines: { type: "CpuProfileLineTick[]" },
                    nodeView: { type: "CpuProfileNodeView" },
                    profileView: { type: "CpuProfileView" },
                    profile: { type: "CpuProfile" },
                },
                seeAlso: [
                    { type: "CpuProfileLineTick" },
                    { type: "CpuProfileNodeView" },
                    { type: "CpuProfileView" },
                    { type: "CpuProfile" },
                ],
            },
            CpuProfileEvents: {
                summary: "Container for user-defined profile markers.",
                properties: {
                    markers: { type: "string[]" },
                    timestamps: { type: "TimeSpan[]" },
                    hitCount: { type: "number" },
                    events: { type: "CpuProfileEvent[]" },
                    profile: { type: "CpuProfile" },
                },
                methods: {
                    getEvent: { signature: "(eventName: string): CpuProfileEvent" },
                    getRanges: { signature: "(startEventName: string, endEventName: string): Range<TimeSpan>[]" },
                },
                seeAlso: [
                    { type: "CpuProfileEvent" },
                    { type: "CpuProfile" },
                    { type: "Range" },
                    { type: "TimeSpan" },
                ],
            },
            CpuProfileEvent: {
                summary: "A user-defined profile marker.",
                properties: {
                    eventName: { type: "string" },
                    timestamps: { type: "TimeSpan[]" },
                    startTime: { type: "TimeSpan" },
                    endTime: { type: "TimeSpan" },
                    hitCount: { type: "number" },
                    profileEvents: { type: "CpuProfileEvents" },
                    profile: { type: "CpuProfile" },
                },
                seeAlso: [
                    { type: "CpuProfileEvents" },
                    { type: "CpuProfile" },
                    { type: "TimeSpan" },
                ],
            },
            Category: {
                summary: "A category for a profiler node.",
                staticProperties: {
                    native: { type: "Category" },
                    node: { type: "Category" },
                    system: { type: "Category" },
                    gc: { type: "Category" },
                    program: { type: "Category" },
                    idle: { type: "Category" },
                    user: { type: "Category" },
                    compiler: { type: "Category" },
                    parser: { type: "Category" },
                    binder: { type: "Category" },
                    checker: { type: "Category" },
                    emitter: { type: "Category" },
                    transformer: { type: "Category" },
                    profiler: { type: "Category" },
                    other: { type: "Category" },
                },
                properties: {
                    name: { type: "string" },
                    parent: { type: "Category" },
                },
                staticMethods: {
                    get: { signature: "(name: string, parent?: Category): Category" },
                },
                methods: {
                    isCategory: { signature: "(category: Category | string): boolean" },
                    toString: { signature: "(): string" },
                },
            },
            Range: {
                typeParams: "<T>",
                summary: "Represents a range of values.",
                constructors: [
                    {
                        signature:
                            "(left: T | Unbounded, right: T | Unbounded, isLeftClosed?: boolean, isRightClosed?: boolean)",
                    },
                ],
                types: {
                    Unbounded: { type: "typeof leftUnbounded | typeof rightUnbounded" },
                },
                staticProperties: {
                    leftUnbounded: { type: "unique symbol" },
                    rightUnbounded: { type: "unique symbol" },
                },
                properties: {
                    left: { type: "T | Unbounded" },
                    right: { type: "T | Unbounded" },
                    isLeftClosed: { type: "boolean" },
                    isRightClosed: { type: "boolean" },
                    isEmpty: { type: "boolean" },
                    isDegenerate: { type: "boolean" },
                    isLeftUnbounded: { type: "boolean" },
                    isRightUnbounded: { type: "boolean" },
                    isUnbounded: { type: "boolean" },
                    isClosed: { type: "boolean" },
                },
                staticMethods: {
                    empty: { signature: "<T>(): Range<T>" },
                    unbounded: { signature: "<T>(): Range<T>" },
                    degenerate: { signature: "<T>(value: T): Range<T>" },
                    open: { signature: "<T>(left: T, right: T): Range<T>" },
                    closed: { signature: "<T>(left: T, right: T): Range<T>" },
                    openClosed: { signature: "<T>(left: T, right: T): Range<T>" },
                    openUnbounded: { signature: "<T>(left: T): Range<T>" },
                    closedOpen: { signature: "<T>(left: T, right: T): Range<T>" },
                    closedUnbounded: { signature: "<T>(left: T): Range<T>" },
                    unboundedOpen: { signature: "<T>(right: T): Range<T>" },
                    unboundedClosed: { signature: "<T>(right: T): Range<T>" },
                    normalize: { signature: "<T>(ranges: Iterable<Range<T>>): Range<T>;" },
                    union: {
                        signature: "<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>): Iterable<Range<T>>",
                    },
                    intersect: {
                        signature: "<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>): Iterable<Range<T>>",
                    },
                    invert: { signature: "<T>(ranges: Iterable<Range<T>>): Iterable<Range<T>>" },
                    relativeComplement: {
                        signature: "<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>): Iterable<Range<T>>",
                    },
                },
                methods: {
                    includes: { signature: "(value: Range<T> | T): boolean" },
                    overlaps: { signature: "(other: Range<T>): boolean" },
                    union: { signature: "(other: Range<T>): Range<T>" },
                    intersect: { signature: "(other: Range<T>): Range<T>" },
                    clampLeft: { signature: "(min: T, max: T): T" },
                    clampRight: { signature: "(min: T, max: T): T" },
                    toString: { signature: "(): string" },
                },
            },
            TimeSpan: {
                summary: "Represents an amount of time.",
                constructors: [
                    { signature: "(value: number | [number, number])" },
                ],
                staticProperties: {
                    MAX_VALUE: { type: "TimeSpan" },
                    MIN_VALUE: { type: "TimeSpan" },
                    POSITIVE_INFINITY: { type: "TimeSpan" },
                    NEGATIVE_INFINITY: { type: "TimeSpan" },
                    ZERO: { type: "TimeSpan" },
                    NaN: { type: "TimeSpan" },
                },
                properties: {
                    days: { type: "number" },
                    hours: { type: "number" },
                    minutes: { type: "number" },
                    seconds: { type: "number" },
                    milliseconds: { type: "number" },
                    microseconds: { type: "number" },
                    totalDays: { type: "number" },
                    totalHours: { type: "number" },
                    totalMinutes: { type: "number" },
                    totalSeconds: { type: "number" },
                    totalMilliseconds: { type: "number" },
                    totalMicroseconds: { type: "number" },
                },
                staticMethods: {
                    parse: { signature: "(text: string): TimeSpan" },
                    isNaN: { signature: "(value: TimeSpan): boolean" },
                    fromDays: { signature: "(value: number): TimeSpan" },
                    fromHours: { signature: "(value: number): TimeSpan" },
                    fromMinutes: { signature: "(value: number): TimeSpan" },
                    fromSeconds: { signature: "(value: number): TimeSpan" },
                    fromMilliseconds: { signature: "(value: number): TimeSpan" },
                    fromMicroseconds: { signature: "(value: number): TimeSpan" },
                    fromTimeStamp: { signature: "(value: [number, number]): TimeSpan" },
                    max: { signature: "(...values: TimeSpan[]): TimeSpan" },
                    min: { signature: "(...values: TimeSpan[]): TimeSpan" },
                    compare: { signature: "(left: TimeSpan, right: TimeSpan): number" },
                    equals: { signature: "(left: TimeSpan, right: TimeSpan): boolean" },
                },
                methods: {
                    "compareTo": { signature: "(other: TimeSpan): number" },
                    "equals": { signature: "(other: TimeSpan): boolean" },
                    "negate": { signature: "(): TimeSpan" },
                    "add": { signature: "(other: TimeSpan): TimeSpan" },
                    "subtract": { signature: "(other: TimeSpan): TimeSpan" },
                    "scale": { signature: "(value: number): TimeSpan" },
                    "toTimestamp": { signature: "(): [number, number]" },
                    "toJSON": { signature: "(): any" },
                    "toShortString": { signature: "(): string" },
                    "toLocaleString": {
                        signature: "(locale?: string | string[], options?: Intl.NumberFormatOptions): string",
                    },
                    "toString": { signature: "(): string" },
                    "valueOf": { signature: "(): number" },
                    "[Comparable.compareTo]": { signature: "(other: TimeSpan): number" },
                },
                seeAlso: [
                    { type: "Comparable" },
                ],
            },
            Query: {
                summary: "A query over an Iterable.",
                seeAlso: [
                    { link: "http://rbuckton.github.io/iterable-query/classes/_iterable_query_.query.html" },
                ],
            },
            HierarchyQuery: {
                summary: "A hierarchical query over an Iterable.",
                seeAlso: [
                    { link: "rbuckton.github.io/iterable-query/classes/_iterable_query_.hierarchyquery.html" },
                ],
            },
            Comparable: {
                summary: "An object that can be compared to another object of the same type.",
                seeAlso: [
                    { link: "http://rbuckton.github.io/iterable-query/interfaces/_iterable_query_.comparable.html" },
                ],
            },
        },
        tables: {
            functions: {
                summary: "profile nodes aggregated by function.",
                type: "HierarchyQuery<CpuProfileNodeView>",
                notes: [
                    `  By default, only commonly relevant fields are rendered in a result\n  returning a CpuProfileNodeView. For all fields use object spread syntax:\n\n${
                        chalk.gray(`    from f in functions\n    select { ...f }`)
                    }`,
                ],
                views: {
                    user_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("user")
                        } functions.`,
                    },
                    native_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("native")
                        } functions.`,
                    },
                    node_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("NodeJS")
                        } functions.`,
                    },
                    profiler_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("profiler")
                        } functions.`,
                    },
                    system_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("system")
                        } functions.`,
                    },
                    compiler_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("compiler")
                        } functions.`,
                    },
                    parser_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("parser")
                        } functions.`,
                    },
                    binder_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("binder")
                        } functions.`,
                    },
                    checker_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("checker")
                        } functions.`,
                    },
                    emitter_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("emitter")
                        } functions.`,
                    },
                    deoptimized_functions: {
                        summary: `A view for ${chalk.cyan("functions")} that only contains ${
                            chalk.magenta("deoptimized")
                        } functions.`,
                    },
                },
                seeAlso: [
                    { type: "CpuProfileNodeView" },
                    { type: "HierarchyQuery" },
                ],
            },
            files: {
                summary: "profile nodes aggregated by file.",
                type: "HierarchyQuery<CpuProfileNodeView>",
                notes: [
                    `  By default, only commonly relevant fields are rendered in a result\n  returning a CpuProfileNodeView. For all fields use object spread syntax:\n\n${
                        chalk.gray(`    from f in files\n    select { ...f }`)
                    }`,
                ],
                seeAlso: [
                    { type: "CpuProfileNodeView" },
                    { type: "HierarchyQuery" },
                ],
            },
            categories: {
                summary: "profile nodes aggregated by category.",
                type: "HierarchyQuery<CpuProfileNodeView>",
                notes: [
                    `  By default, only commonly relevant fields are rendered in a result\n  returning a CpuProfileNodeView. For all fields use object spread syntax:\n\n${
                        chalk.gray(`    from f in categories\n    select { ...f }`)
                    }`,
                ],
                seeAlso: [
                    { type: "CpuProfileNodeView" },
                    { type: "HierarchyQuery" },
                    { type: "Category" },
                ],
            },
            events: {
                summary: "user-generated profile markers.",
                type: "Query<CpuProfileEvent>",
                notes: [
                    `  By default, only commonly relevant fields are rendered in a result\n  returning a CpuProfileEvent. For all fields use object spread syntax:\n\n${
                        chalk.gray(`    from e in events\n    select { ...e }`)
                    }`,
                ],
                seeAlso: [
                    { type: "CpuProfileEvent" },
                    { type: "Query" },
                ],
            },
            nodes: {
                summary: "raw profile nodes.",
                type: "HierarchyQuery<CpuProfileNode>",
                notes: [
                    `  By default, only commonly relevant fields are rendered in a result\n  returning a CpuProfileNode. For all fields use object spread syntax:\n\n${
                        chalk.gray(`    from n in nodes\n    select { ...n }`)
                    }`,
                ],
                seeAlso: [
                    { type: "CpuProfileNode" },
                    { type: "HierarchyQuery" },
                ],
            },
            user_functions: { alias: "functions" },
            native_functions: { alias: "functions" },
            node_functions: { alias: "functions" },
            profiler_functions: { alias: "functions" },
            system_functions: { alias: "functions" },
            compiler_functions: { alias: "functions" },
            parser_functions: { alias: "functions" },
            binder_functions: { alias: "functions" },
            checker_functions: { alias: "functions" },
            emitter_functions: { alias: "functions" },
            deoptimized_functions: { alias: "functions" },
        },
        examples: [
            `  # Get user code sorted by totalTime
  from f in functions
  where f.isUserCode
  orderby f.totalTime descending
  select f`,

            `  # Get the line ticks of a function
  from f in functions
  where f.functionName === "isRelatedTo"
  from line in f.lines
  select line`,
        ],
    });
}
