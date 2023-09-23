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

@Table<CpuProfileCategoryView, TableContext>({
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
        {
            header: "category",
            key: "path",
            expression: x => `${x.name}${x.parent ? ` ${chalk.gray(`(${x.parent.name})`)}` : ``}`,
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
        },
        { header: "bailout reason", condition: ctx => ctx.selectionHasBailouts, expression: x => x.bailoutReason },
    ],
    cellStyles: [
        { key: "path", match: x => x.isMetaCode, foregroundColor: "magenta" },
        { key: "path", match: x => !x.isUserCode && !x.isMetaCode, foregroundColor: "dark-yellow" },
    ],
})
export class CpuProfileCategoryView {
    readonly profile: CpuProfile;
    readonly category: Category;
    readonly nodes: readonly CpuProfileNode[];

    private _lazyCommonFields = Lazy.from(getCommonFields, this);
    private _lazyCategories = Lazy.from(getCategories, this);
    private _lazyTimestamps = Lazy.from(getTimestamps, this);
    private _lazyParent = Lazy.from(getParent, this);
    private _lazyChildren = Lazy.from(getChildren, this);
    private _lazyTotalCount = Lazy.from(getTotalCount, this);

    constructor(profile: CpuProfile, category: Category, nodes: readonly CpuProfileNode[]) {
        this.profile = profile;
        this.category = category;
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
    get parent(): CpuProfileCategoryView | undefined {
        return this._lazyParent.value;
    }
    get children(): readonly CpuProfileCategoryView[] {
        return this._lazyChildren.value;
    }

    // aliases
    get name(): string {
        return this.category.name;
    }
    get path(): string {
        return this.category.path;
    }
    get deoptCount(): number {
        return this.bailoutCount;
    }
    get deoptReason(): string {
        return this.bailoutReason;
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

function getCommonFields(file: CpuProfileCategoryView) {
    let selfCount = 0;
    let bailoutCount = 0;
    const bailoutReasons = new Set<string>();

    for (const node of file.nodes) {
        if (node.category === file.category) {
            selfCount += node.selfCount;
        }
        if (node.bailoutReason) {
            bailoutReasons.add(node.bailoutReason);
            bailoutCount++;
        }
    }

    const bailoutReason = [...bailoutReasons].join("\n");
    return { selfCount, bailoutCount, bailoutReason };
}

function getCategories(func: CpuProfileCategoryView) {
    return from(func.nodes)
        .select(node => node.category)
        .through(Category.reduce)
        .toArray();
}

function getTimestamps(func: CpuProfileCategoryView) {
    return from(func.nodes)
        .selectMany(node => node.timestamps)
        .orderBy(fn.identity)
        .toArray();
}

function getParent(view: CpuProfileCategoryView): CpuProfileCategoryView | undefined {
    return view.category.parent
        ? view.profile.getCategoryView(view.category.parent)
        : undefined;
}

function getChildren(view: CpuProfileCategoryView) {
    return from(view.category.children)
        .where(child => view.profile.hasCategoryView(child))
        .select(child => view.profile.getCategoryView(child))
        .toArray();
}

function getTotalCount(view: CpuProfileCategoryView) {
    return view.selfCount + from(view.children)
        .sum(child => child.totalCount);
}
