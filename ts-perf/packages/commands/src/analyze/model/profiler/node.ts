import { fmt, Range, TimeSpan } from "@ts-perf/api";
import * as inspector from "@ts-perf/inspector";
import chalk from "chalk";
import { from, HierarchyQuery, Lazy } from "iterable-query";

import { Table } from "../../decorators";
import { Category } from "./category";
import { Location } from "./location";
import { PositionTickInfoView } from "./positionTickInfoView";
import { CpuProfile } from "./profile";

interface TableContext {
    profileDuration: TimeSpan;
    profileHitCount: number;
    selectionDuration: TimeSpan;
    selectionHitCount: number;
    selectionHitPercent: number;
    selectionHasBailouts: boolean;
}

@Table<CpuProfileNode, TableContext>({
    createContext: (values, limit) => {
        const profile = values[0].profile;
        const hitCount = from(values).distinct().sum(node => node.selfCount);
        const duration = profile.averageSampleDuration.scale(hitCount);
        const hasBailouts = from(values).take(limit).some(node => !!node.bailoutReason);
        return {
            profileDuration: profile.duration,
            profileHitCount: profile.totalCount,
            selectionDuration: duration,
            selectionHitCount: hitCount,
            selectionHitPercent: hitCount / profile.totalCount,
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
        { header: "bailout reason", condition: ctx => ctx.selectionHasBailouts, expression: x => x.bailoutReason },
    ],
    cellStyles: [
        { key: "functionName", match: x => x.isMetaCode, foregroundColor: "magenta" },
        { key: "functionName", match: x => !x.isUserCode && !x.isMetaCode, foregroundColor: "dark-yellow" },
    ],
})
export class CpuProfileNode {
    readonly callUID: string;
    readonly id: number;
    readonly functionName: string;
    readonly scriptId: inspector.ScriptId;
    readonly location: Location;
    readonly bailoutReason: string;
    readonly category: Category;

    private _selfCount: number;
    private _totalCount: number;
    private _profile!: CpuProfile;
    private _parent: CpuProfileNode | undefined;
    private _children: CpuProfileNode[] = [];
    private _timestamps: TimeSpan[] = [];
    private _startTime: TimeSpan | undefined;
    private _endTime: TimeSpan | undefined;
    private _lazyPositionTicks: Lazy<ReturnType<typeof getPositionTicks>>;

    constructor(json: inspector.ProfileNode) {
        this.id = json.id;
        this.callUID =
            `${json.callFrame.functionName}@${json.callFrame.scriptId}:${json.callFrame.lineNumber}:${json.callFrame.columnNumber}`;
        this.functionName = json.callFrame.functionName;
        this.scriptId = json.callFrame.scriptId;
        this.location = Location.fromCallFrame(json.callFrame);
        this.bailoutReason = json.deoptReason || "";
        this.category = Category.for(json);
        this._selfCount = json.hitCount || 0;
        this._totalCount = json.hitCount || 0;
        this._lazyPositionTicks = Lazy.from(getPositionTicks, this, json);
    }

    get profile() {
        return this._profile;
    }
    get parent() {
        return this._parent;
    }
    get selfCount() {
        return this._selfCount;
    }
    get selfTime() {
        return this.profile.averageSampleDuration.scale(this._selfCount);
    }
    get selfPercent() {
        return this._selfCount / this.profile.totalCount;
    }
    get totalCount() {
        return this._totalCount;
    }
    get totalTime() {
        return this.profile.averageSampleDuration.scale(this._totalCount);
    }
    get totalPercent() {
        return this._totalCount / this.profile.totalCount;
    }
    get children(): readonly CpuProfileNode[] {
        return this._children;
    }
    get timestamps(): readonly TimeSpan[] {
        return this._timestamps;
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
    get isMetaCode(): boolean {
        return this.hasCategory(Category.meta);
    }
    get isSystemCode(): boolean {
        return this.hasCategory(Category.system);
    }
    get isUserCode(): boolean {
        return this.hasCategory(Category.user);
    }
    get startTime(): TimeSpan {
        return this._startTime || (this._startTime = from(this.timestamps).min() || TimeSpan.NaN);
    }
    get endTime(): TimeSpan {
        return this._endTime || (this._endTime = from(this.timestamps).max() || TimeSpan.NaN);
    }
    get positionTicks(): readonly PositionTickInfoView<CpuProfileNode>[] {
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
    get deoptReason() {
        return this.bailoutReason;
    }

    hasCategory(category: Category | string) {
        return this.category.isCategory(category);
    }

    occursWithin(ranges: Iterable<Range<TimeSpan>>) {
        const rangeQuery = from(ranges);
        return this.timestamps.some(timestamp => rangeQuery.some(range => range.includes(timestamp)));
    }

    isBefore(eventName: string): boolean {
        const event = this.profile.events.getEvent(eventName);
        return event ? this.startTime.compareTo(event.startTime) < 0 : false;
    }

    isAfter(eventName: string): boolean {
        const event = this.profile.events.getEvent(eventName);
        return event ? this.endTime.compareTo(event.endTime) > 0 : false;
    }

    isBetween(startEventName: string, endEventName: string): boolean {
        return this.occursWithin(this.profile.events.getRanges(startEventName, endEventName));
    }

    ancestors(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).ancestors(predicate);
    }

    ancestorsAndSelf(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).ancestorsAndSelf(predicate);
    }

    siblings(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).siblings(predicate);
    }

    siblingsAndSelf(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).siblingsAndSelf(predicate);
    }

    descendants(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).descendants(predicate);
    }

    descendantsAndSelf(predicate?: (node: CpuProfileNode) => boolean): HierarchyQuery<CpuProfileNode> {
        return from([this], this.profile.hierarchy).descendantsAndSelf(predicate);
    }
}

function getPositionTicks(node: CpuProfileNode, json: inspector.ProfileNode) {
    const positionTicks: PositionTickInfoView<CpuProfileNode>[] = [];
    let positionTickCount = 0;
    if (json.positionTicks) {
        for (const positionTick of json.positionTicks) {
            positionTickCount += positionTick.ticks;
            positionTicks.push(new PositionTickInfoView(node, [node], positionTick.line, positionTick.ticks));
        }
    }
    return { positionTicks, positionTickCount };
}
