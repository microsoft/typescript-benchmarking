// import * as inspector from "@ts-perf/inspector";
// import chalk = require("chalk");
// import { TimeSpan, Range, formatPercent, padLeft } from "@ts-perf/api";
// import { from, Lazy, fn } from "iterable-query";
// import { CpuProfileNode } from "./node";
// import { Category } from "./category";
// import { CpuProfileView } from "./profileView";
// import { CpuProfile } from "./profile";
// import { Table } from "../../decorators";
// import { CpuProfileLineTickView } from "./lineTickView";

// interface TableContext {
//     readonly profileView: CpuProfileView;
//     readonly hitCount: number;
//     readonly duration: TimeSpan;
//     readonly hasBailouts: boolean;
// }

// const alternateViews = new Set(["files", "categories", "events", "lines"]);

// @Table<CpuProfileNodeView, TableContext>({
//     createContext: (values, limit) => {
//         const profileView = values[0].profileView;
//         const hitCount = from(values).sum(node => node.selfCount);
//         const duration = profileView.profile.averageSampleDuration.scale(hitCount);
//         const hasBailouts = from(values).take(limit).some(node => node.bailoutCount > 0);
//         return { profileView, hitCount, duration, hasBailouts };
//     },
//     headers: [
//         { expression: ({ profileView }) => `duration (total): ${profileView.duration.totalMilliseconds.toFixed(1)} ms, ${profileView.totalCount} samples` },
//         { expression: ({ profileView, hitCount, duration }) => `duration (selection): ${duration.totalMilliseconds.toFixed(1)} ms, ${hitCount} samples ${chalk.gray(`(${formatPercent(hitCount / profileView.profile.totalCount)} of total)`)}` }
//     ],
//     columns: [
//         { header: "function",
//           expression: (x) => `${x.functionName || `(anonymous function)`} ${chalk.gray(`(${x.location})`)}`,
//           condition: ({ profileView }) => !alternateViews.has(profileView.name) },
//         { header: "file",
//           expression: (x) => x.url || "program",
//           condition: ({ profileView }) => profileView.name === "files" },
//         { header: "category",
//           expression: (x) => x.categories.join(", "),
//           condition: ({ profileView }) => profileView.name === "categories" },
//         { header: "self time",
//           expression: (x, _, { hitCount }) => `${x.selfTime.totalMilliseconds.toFixed(1)} ms ${padLeft(chalk.gray(formatPercent(x.selfCount / hitCount)), 7)}`,
//           align: "right" },
//         { header: "total time",
//           expression: (x, _, { hitCount }) => `${x.totalTime.totalMilliseconds.toFixed(1)} ms ${padLeft(chalk.gray(formatPercent(x.totalCount / hitCount)), 7)}`,
//           align: "right" },
//         { header: "bailouts",
//           condition: ({ hasBailouts }) => hasBailouts,
//           expression: x => x.bailoutCount },
//         { header: "bailout reason",
//           condition: ({ hasBailouts }) => hasBailouts,
//           expression: x => x.bailoutReason },
//     ]
// })
// export class CpuProfileNodeView {
//     readonly profile: CpuProfile;
//     readonly profileView: CpuProfileView;
//     readonly nodes: ReadonlyArray<CpuProfileNode>;
//     readonly viewKey: string;

//     private _lazyCommonFields = Lazy.from(getCommonFields, this);
//     private _lazyParent = Lazy.from(getParentView, this);
//     private _lazyChildren = Lazy.from(getChildrenView, this);
//     private _lazyTimestamps = Lazy.from(getTimestamps, this);
//     private _lazySelfCount = Lazy.from(getSelfCount, this);
//     private _lazyTotalCount = Lazy.from(getTotalCount, this);
//     private _lazyLineTicks = Lazy.from(getLineTicks, this);
//     private _lazyLineTickCount = Lazy.from(getLineTickCount, this);

//     constructor(profileView: CpuProfileView, viewKey: string, nodes: Iterable<CpuProfileNode>) {
//         this.profileView = profileView;
//         this.profile = profileView.profile;
//         this.viewKey = viewKey;
//         this.nodes =
//             from(profileView.filterNodes(nodes))
//             .orderBy(node => node.startTime, TimeSpan.compare)
//             .toArray();
//     }

//     get functionName(): string { return this._lazyCommonFields.value.functionName; }
//     get scriptId(): string { return this._lazyCommonFields.value.scriptId; }
//     get url(): string { return this._lazyCommonFields.value.url; }
//     get lineNumber(): number { return this._lazyCommonFields.value.lineNumber; }
//     get columnNumber(): number { return this._lazyCommonFields.value.columnNumber; }
//     get location() { return `${this.url || "program"}:${this.lineNumber + 1}:${this.columnNumber + 1}`; }
//     get bailoutReason(): string { return this._lazyCommonFields.value.bailoutReason; }
//     get bailoutCount(): number { return this._lazyCommonFields.value.bailoutCount; }
//     get startTime(): TimeSpan { return this._lazyCommonFields.value.startTime; }
//     get endTime(): TimeSpan { return this._lazyCommonFields.value.endTime; }
//     get categories(): ReadonlyArray<Category> { return this._lazyCommonFields.value.categories; }
//     get lines(): ReadonlyArray<CpuProfileLineTickView> { return this._lazyLineTicks.value; }
//     get selfCount(): number { return this._lazySelfCount.value; }
//     get totalCount(): number { return this._lazyTotalCount.value; }
//     get lineTickCount(): number { return this._lazyLineTickCount.value; }
//     get selfTime(): TimeSpan { return this.profile.averageSampleDuration.scale(this.selfCount); }
//     get totalTime(): TimeSpan { return this.profile.averageSampleDuration.scale(this.totalCount); }
//     get timestamps(): ReadonlyArray<TimeSpan> { return this._lazyTimestamps.value; }
//     get parent(): CpuProfileNodeView | undefined { return this._lazyParent.value; }
//     get childNodes(): ReadonlyArray<CpuProfileNodeView> { return this._lazyChildren.value; }
//     get isNativeCode(): boolean { return this.hasCategory(Category.native); }
//     get isProfilerCode(): boolean { return this.hasCategory(Category.profiler); }
//     get isNodeCode(): boolean { return this.hasCategory(Category.node); }
//     get isSystemCode(): boolean { return this.hasCategory(Category.system); }
//     get isUserCode(): boolean { return this.hasCategory(Category.user); }

//     static intersect(x: CpuProfileNodeView | undefined, y: CpuProfileNodeView | undefined) {
//         if (x === y) return x;
//         if (x === undefined) return y;
//         if (y === undefined) return x;
//         if (x.profileView.sameKey(x, y)) {
//             return x.slice(Range.intersect(x.profileView.ranges, y.profileView.ranges));
//         }
//         return undefined;
//     }

//     static union(x: CpuProfileNodeView | undefined, y: CpuProfileNodeView | undefined) {
//         if (x === y) return x;
//         if (x === undefined) return y;
//         if (y === undefined) return x;
//         if (x.profileView.sameKey(x, y)) {
//             return x.slice(Range.union(x.profileView.ranges, y.profileView.ranges));
//         }
//         return undefined;
//     }

//     hasCategory(category: Category | string) {
//         for (const nodeCategory of this.categories) {
//             if (nodeCategory.isCategory(category)) return true;
//         }
//         return false;
//     }

//     occursWithin(ranges: Iterable<Range<TimeSpan>>) {
//         const rangeQuery = from(ranges);
//         return this.timestamps.some(timestamp => rangeQuery.some(range => range.includes(timestamp)));
//     }

//     slice(ranges: Iterable<Range<TimeSpan>>) {
//         const profileView = this.profileView.slice(ranges);
//         return profileView.viewForKey(this.viewKey);
//     }

//     aggregate(keySelector: (node: CpuProfileNode) => string, ranges?: Iterable<Range<TimeSpan>>) {
//         const profileView = this.profileView.aggregate(keySelector, ranges);
//         return profileView.viewsFor(this.nodes);
//     }

//     ancestors(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).ancestors(predicate);
//     }

//     ancestorsAndSelf(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).ancestorsAndSelf(predicate);
//     }

//     children(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).children(predicate);
//     }

//     siblings(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).siblings(predicate);
//     }

//     siblingsAndSelf(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).siblingsAndSelf(predicate);
//     }

//     descendants(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).descendants(predicate);
//     }

//     descendantsAndSelf(predicate?: (node: CpuProfileNodeView) => boolean) {
//         return from([this], this.profileView.hierarchy).descendantsAndSelf(predicate);
//     }

//     isBefore(eventName: string): boolean {
//         const event = this.profile.events.getEvent(eventName);
//         return event ? this.startTime.compareTo(event.startTime) < 0 : false;
//     }

//     isAfter(eventName: string): boolean {
//         const event = this.profile.events.getEvent(eventName);
//         return event ? this.endTime.compareTo(event.endTime) > 0 : false;
//     }

//     isBetween(startEventName: string, endEventName: string): boolean {
//         return this.occursWithin(this.profile.events.getRanges(startEventName, endEventName));
//     }
// }

// function mergeStrings(strings: string[]) {
//     return strings.join("\n");
// }

// function getCommonFields(view: CpuProfileNodeView) {
//     const functionNames = new Set<string>();
//     const urls = new Set<string>();
//     const bailoutReasons = new Set<string>();
//     const scriptIds = new Set<string>();
//     const categories = new Set<Category>();

//     let invalidPosition = false;
//     let lineNumber: number | undefined;
//     let columnNumber: number | undefined;
//     let startTime = TimeSpan.POSITIVE_INFINITY;
//     let endTime = TimeSpan.NEGATIVE_INFINITY;
//     let bailoutCount = 0;

//     for (const node of view.nodes) {
//         if (node.functionName) functionNames.add(node.functionName);
//         if (node.bailoutReason) {
//             bailoutReasons.add(node.bailoutReason);
//             bailoutCount++;
//         }

//         if (node.scriptId) scriptIds.add(node.scriptId);
//         if (node.url) {
//             const initialSize = urls.size;
//             urls.add(node.url);
//             if (initialSize === 0 && urls.size === 1) {
//                 lineNumber = node.lineNumber;
//                 columnNumber = node.columnNumber;
//             }
//             else if (!invalidPosition && (node.lineNumber !== lineNumber || node.columnNumber !== columnNumber)) {
//                 lineNumber = -1;
//                 columnNumber = -1;
//                 invalidPosition = true;
//             }
//         }
//         if (node.startTime.compareTo(startTime) < 0) startTime = node.startTime;
//         if (node.endTime.compareTo(endTime) > 0) endTime = node.endTime;
//         for (const category of node.categories) {
//             categories.add(category);
//         }
//     }

//     startTime = TimeSpan.max(startTime, view.profileView.startTime);
//     endTime = TimeSpan.min(endTime, view.profileView.endTime);

//     return {
//         functionName: mergeStrings([...functionNames]),
//         scriptId: mergeStrings([...scriptIds]),
//         url: mergeStrings([...urls]),
//         lineNumber: lineNumber === undefined ? -1 : lineNumber,
//         columnNumber: columnNumber === undefined ? -1 : columnNumber,
//         bailoutReason: mergeStrings([...bailoutReasons]),
//         bailoutCount,
//         startTime,
//         endTime,
//         categories: [...categories]
//     };
// }

// function getSelfCount(view: CpuProfileNodeView) {
//     return view.timestamps.length;
// }

// function getTotalCount(view: CpuProfileNodeView) {
//     return from(view.nodes, view.profileView.profile.hierarchy)
//         .distinct()
//         .topMost()
//         .selectMany(node => view.profileView.filterTimestamps(node.timestamps))
//         .count();
// }

// function getLineTicks(view: CpuProfileNodeView) {
//     return from(view.nodes)
//         .selectMany(node => node.lines)
//         .groupBy(line => line.lineNumber, fn.identity, (_, lines) => new CpuProfileLineTickView(view, lines))
//         .orderBy(line => line.lineNumber)
//         .toArray();
// }

// function getTimestamps(view: CpuProfileNodeView): ReadonlyArray<TimeSpan> {
//     return from(view.nodes)
//         .selectMany(node => node.timestamps)
//         .through(timestamps => view.profileView.filterTimestamps(timestamps))
//         .orderBy(timestamp => timestamp.totalMicroseconds)
//         .toArray();
// }

// function getParentView(view: CpuProfileNodeView): CpuProfileNodeView | undefined {
//     return from(view.nodes, view.profileView.profile.hierarchy)
//         .parents()
//         .except(view.nodes)
//         .through(parents => view.profileView.viewsFor(parents))
//         .first();
// }

// function getChildrenView(view: CpuProfileNodeView): ReadonlyArray<CpuProfileNodeView> {
//     return from(view.nodes, view.profileView.profile.hierarchy)
//         .children()
//         .except(view.nodes)
//         .through(children => view.profileView.viewsFor(children))
//         .toArray();
// }

// function getLineTickCount(node: CpuProfileNodeView) {
//     return from(node.lines).sum(line => line.ticks);
// }

export {};
