import { fmt, Range, TimeSpan } from "@ts-perf/api";
import chalk from "chalk";
import { fn, from, Lazy } from "iterable-query";

import { Table } from "../../decorators";
import { Category } from "./category";
import { CpuProfileNode } from "./node";
import { CpuProfile } from "./profile";

interface TableContext {
    profileHitCount: number;
    profileDuration: TimeSpan;
    selectionHitCount: number;
    selectionHitPercent: number;
    selectionDuration: TimeSpan;
    selectionHasBailouts: boolean;
}

@Table<CpuProfileFileView, TableContext>({
    createContext: (values, limit) => {
        const profile = values[0].profile;
        const hitCount = from(values).distinct().sum(node => node.selfCount);
        const duration = profile.averageSampleDuration.scale(hitCount);
        const hasBailouts = from(values).take(limit).some(node => node.bailoutCount > 0);
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
        { header: "file", key: "url", expression: x => x.url },
        {
            header: "self time",
            expression: x =>
                `${fmt.formatMilliseconds(x.selfTime)} ${
                    fmt.formatPercent(x.selfPercent, { pad: 7, color: chalk.gray })
                }`,
            align: "right",
        },
        {
            header: "bailouts",
            condition: ctx => ctx.selectionHasBailouts,
            expression: x => x.bailoutCount > 0 ? x.bailoutCount : "",
        },
        { header: "bailout reason", condition: ctx => ctx.selectionHasBailouts, expression: x => x.bailoutReason },
    ],
    cellStyles: [
        { key: "url", match: x => x.isMetaCode, foregroundColor: "magenta" },
        { key: "url", match: x => x.isProfilerCode, foregroundColor: "gray" },
        { key: "url", match: x => !x.isUserCode && !x.isMetaCode, foregroundColor: "dark-yellow" },
    ],
})
export class CpuProfileFileView {
    readonly profile: CpuProfile;
    readonly url: string;
    readonly nodes: readonly CpuProfileNode[];

    private _lazyCommonFields = Lazy.from(getCommonFields, this);
    private _lazyCategories = Lazy.from(getCategories, this);
    private _lazyTimestamps = Lazy.from(getTimestamps, this);

    constructor(profile: CpuProfile, url: string, nodes: readonly CpuProfileNode[]) {
        this.profile = profile;
        this.url = url || "program";
        this.nodes = nodes;
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
    get bailoutCount(): number {
        return this._lazyCommonFields.value.bailoutCount;
    }
    get bailoutReason(): string {
        return this._lazyCommonFields.value.bailoutReason;
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

function getCommonFields(file: CpuProfileFileView) {
    let selfCount = 0;
    let bailoutCount = 0;
    const bailoutReasons = new Set<string>();

    for (const node of file.nodes) {
        selfCount += node.selfCount;
        if (node.bailoutReason) {
            bailoutReasons.add(node.bailoutReason);
            bailoutCount++;
        }
    }

    const bailoutReason = [...bailoutReasons].join("\n");
    return { selfCount, bailoutCount, bailoutReason };
}

function getCategories(func: CpuProfileFileView) {
    return from(func.nodes)
        .select(node => node.category)
        .through(Category.reduce)
        .toArray();
}

function getTimestamps(func: CpuProfileFileView) {
    return from(func.nodes)
        .selectMany(node => node.timestamps)
        .orderBy(fn.identity)
        .toArray();
}
