import { fmt, Range, TimeSpan } from "@ts-perf/api";
import { PositionTickInfo } from "@ts-perf/inspector";
import chalk from "chalk";
import { fn, from, Lazy } from "iterable-query";

import { Table } from "../../decorators";
import { BailoutView } from "./bailoutView";
import { Category } from "./category";
import { Location } from "./location";
import { CpuProfileNode } from "./node";
import { PositionTickInfoView } from "./positionTickInfoView";
import { CpuProfile } from "./profile";

interface TableContext {
    profileHitCount: number;
    profileDuration: TimeSpan;
    selectionHitCount: number;
    selectionHitPercent: number;
    selectionDuration: TimeSpan;
    selectionHasBailouts: boolean;
}

@Table<CpuProfileFunctionView, TableContext>({
    createContext: (values, limit) => {
        const profile = values[0].profile;
        const hitCount = from(values).distinct().sum(node => node.selfCount);
        const hitPercent = hitCount / profile.totalCount;
        const duration = profile.averageSampleDuration.scale(hitCount);
        const hasBailouts = from(values).take(limit).some(node => node.bailoutCount > 0);
        return {
            profileHitCount: profile.totalCount,
            profileDuration: profile.duration,
            selectionHitCount: hitCount,
            selectionHitPercent: hitPercent,
            selectionDuration: duration,
            selectionHasBailouts: hasBailouts,
        };
    },
    headers: [
        {
            expression: ctx =>
                `duration (total): ${fmt.formatMilliseconds(ctx.profileDuration)}, ${ctx.profileHitCount} samples`,
        },
        {
            expression: ctx =>
                `duration (selection): ${
                    fmt.formatMilliseconds(ctx.selectionDuration)
                }, ${ctx.selectionHitCount} samples ${
                    chalk.gray(`(${fmt.formatPercent(ctx.selectionHitPercent)} of total)`)
                }`,
        },
    ],
    columns: [
        {
            header: "function",
            key: "functionName",
            expression: x => `${x.functionName || `(anonymous function)`} ${chalk.gray(`(${x.location})`)}`,
        },
        {
            header: "self time",
            expression: x =>
                `${fmt.formatMilliseconds(x.selfTime)} ${
                    fmt.formatPercent(x.selfPercent, { pad: 7, color: chalk.gray })
                }`,
            align: "right",
        },
        {
            header: "total time",
            expression: x =>
                `${fmt.formatMilliseconds(x.totalTime)} ${
                    fmt.formatPercent(x.totalPercent, { pad: 7, color: chalk.gray })
                }`,
            align: "right",
        },
        {
            header: "bailouts",
            condition: ctx => ctx.selectionHasBailouts,
            expression: x => x.bailoutCount > 0 ? x.bailoutCount : "",
            align: "right",
        },
        { header: "bailout reason", condition: ctx => ctx.selectionHasBailouts, expression: x => x.bailoutReason },
    ],
    cellStyles: [
        { key: "functionName", match: x => x.isMetaCode, foregroundColor: "magenta" },
        { key: "functionName", match: x => !x.isUserCode && !x.isMetaCode, foregroundColor: "dark-yellow" },
    ],
})
export class CpuProfileFunctionView {
    readonly profile: CpuProfile;
    readonly callUID: string;
    readonly nodes: readonly CpuProfileNode[];
    readonly functionName: string;
    readonly scriptId: string;
    readonly location: Location;

    private _lazyCommonFields = Lazy.from(getCommonFields, this);
    private _lazyTotalCount = Lazy.from(getTotalCount, this);
    private _lazyCategories = Lazy.from(getCategories, this);
    private _lazyTimestamps = Lazy.from(getTimestamps, this);
    private _lazyBailouts = Lazy.from(getBailouts, this);
    private _lazyCallers = Lazy.from(getCallers, this);
    private _lazyCallees = Lazy.from(getCallees, this);
    private _lazyPositionTicks = Lazy.from(getPositionTicks, this);

    constructor(profile: CpuProfile, callUID: string, nodes: readonly CpuProfileNode[]) {
        this.profile = profile;
        this.callUID = callUID;
        this.nodes = nodes;
        this.functionName = nodes[0].functionName;
        this.scriptId = nodes[0].scriptId;
        this.location = nodes[0].location;
    }

    get selfCount(): number {
        return this._lazyCommonFields.value.selfCount;
    }
    get selfTime(): TimeSpan {
        return this.profile.averageSampleDuration.scale(this.selfCount);
    }
    get selfPercent(): number {
        return this.selfCount / this.profile.totalCount;
    }
    get totalCount(): number {
        return this._lazyTotalCount.value;
    }
    get totalTime(): TimeSpan {
        return this.profile.averageSampleDuration.scale(this.totalCount);
    }
    get totalPercent(): number {
        return this.totalCount / this.profile.totalCount;
    }
    get bailoutCount(): number {
        return this._lazyCommonFields.value.bailoutCount;
    }
    get bailoutReason(): string {
        return this._lazyCommonFields.value.bailoutReason;
    }
    get bailouts(): readonly BailoutView<CpuProfileFunctionView>[] {
        return this._lazyBailouts.value;
    }
    get categories(): readonly Category[] {
        return this._lazyCategories.value;
    }
    get isNativeCode(): boolean {
        return this.hasCategory(Category.native);
    }
    get isProfilerCode(): boolean {
        return this.hasCategory(Category.profiler);
    }
    get isNodeCode(): boolean {
        return this.hasCategory(Category.node);
    }
    get isSystemCode(): boolean {
        return this.hasCategory(Category.system);
    }
    get isMetaCode(): boolean {
        return this.hasCategory(Category.meta);
    }
    get isUserCode(): boolean {
        return this.hasCategory(Category.user);
    }
    get timestamps(): readonly TimeSpan[] {
        return this._lazyTimestamps.value;
    }
    get callers(): readonly CpuProfileFunctionView[] {
        return this._lazyCallers.value;
    }
    get callees(): readonly CpuProfileFunctionView[] {
        return this._lazyCallees.value;
    }
    get positionTicks(): readonly PositionTickInfoView<CpuProfileFunctionView>[] {
        return this._lazyPositionTicks.value.positionTicks;
    }
    get positionTickCount(): number {
        return this._lazyPositionTicks.value.positionTickCount;
    }

    // aliases
    get name() {
        return this.functionName;
    }
    get url() {
        return this.location.url;
    }
    get lineNumber() {
        return this.location.lineNumber;
    }
    get line() {
        return this.location.lineNumber;
    }
    get columnNumber() {
        return this.location.columnNumber;
    }
    get column() {
        return this.location.columnNumber;
    }
    get lines() {
        return this.positionTicks;
    }
    get deoptCount() {
        return this.bailoutCount;
    }
    get deoptReason() {
        return this.bailoutReason;
    }
    get deopts() {
        return this.bailouts;
    }

    hasCategory(category: Category | string) {
        for (const nodeCategory of this.categories) {
            if (nodeCategory.isCategory(category)) return true;
        }
        return false;
    }

    occursWithin(ranges: Iterable<Range<TimeSpan>>) {
        const rangeQuery = from(ranges);
        return this.timestamps.some(timestamp => rangeQuery.some(range => range.includes(timestamp)));
    }

    isBefore(eventName: string): boolean {
        const event = this.profile.events.getEvent(eventName);
        return event ? this.timestamps[0].compareTo(event.startTime) < 0 : false;
    }

    isAfter(eventName: string): boolean {
        const event = this.profile.events.getEvent(eventName);
        return event ? this.timestamps[this.timestamps.length - 1].compareTo(event.endTime) > 0 : false;
    }

    isBetween(startEventName: string, endEventName: string): boolean {
        return this.occursWithin(this.profile.events.getRanges(startEventName, endEventName));
    }
}

function getCommonFields(func: CpuProfileFunctionView) {
    let selfCount = 0;
    let bailoutCount = 0;
    const bailoutReasons = new Set<string>();

    for (const node of func.nodes) {
        selfCount += node.selfCount;
        if (node.bailoutReason) {
            bailoutReasons.add(node.bailoutReason);
            bailoutCount++;
        }
    }

    const bailoutReason = [...bailoutReasons].join("\n");
    return { selfCount, bailoutCount, bailoutReason };
}

function getTotalCount(func: CpuProfileFunctionView) {
    return from(func.nodes, func.profile.hierarchy)
        .topMost()
        .distinct()
        .sum(node => node.totalCount);
}

function getCategories(func: CpuProfileFunctionView) {
    return from(func.nodes)
        .select(node => node.category)
        .through(Category.reduce)
        .toArray();
}

function getTimestamps(func: CpuProfileFunctionView) {
    return from(func.nodes)
        .selectMany(node => node.timestamps)
        .orderBy(fn.identity)
        .toArray();
}

function getBailouts(func: CpuProfileFunctionView) {
    return from(func.nodes)
        .where(node => !!node.bailoutReason)
        .groupBy(
            node => node.bailoutReason,
            fn.identity,
            (reason, nodes) => new BailoutView(func, reason, nodes.toArray()),
        )
        .toArray();
}

function getCallers(func: CpuProfileFunctionView) {
    return from(func.nodes)
        .select(node => node.parent)
        .whereDefined()
        .select(node => func.profile.getFunctionView(node))
        .distinct()
        .toArray();
}

function getCallees(func: CpuProfileFunctionView) {
    return from(func.nodes)
        .selectMany(node => node.children)
        .select(child => func.profile.getFunctionView(child))
        .distinct()
        .toArray();
}

function getPositionTicks(func: CpuProfileFunctionView) {
    let positionTickCount = 0;
    const lines = new Map<number, { node: CpuProfileNode; positionTick: PositionTickInfo; }[]>();
    for (const node of func.nodes) {
        for (const positionTick of node.positionTicks) {
            positionTickCount += positionTick.ticks;
            multiMapAdd(lines, positionTick.line, { node, positionTick });
        }
    }

    const positionTicks = from(lines)
        .select(([lineNumber, entries]) =>
            new PositionTickInfoView(
                func,
                entries.map(entry => entry.node),
                lineNumber,
                from(entries).sum(entry => entry.positionTick.ticks),
            )
        )
        .orderBy(node => node.lineNumber)
        .toArray();

    return { positionTicks, positionTickCount };
}

function multiMapAdd<K, V>(map: Map<K, V[]>, key: K, value: V) {
    const values = map.get(key);
    if (values) {
        values.push(value);
    }
    else {
        map.set(key, [value]);
    }
}
