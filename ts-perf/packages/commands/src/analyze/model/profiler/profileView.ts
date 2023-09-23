// import { from, Lazy, Lookup } from "iterable-query";
// import { Range, TimeSpan } from "@ts-perf/api";
// import { CpuProfile } from "./profile";
// import { CpuProfileNode } from "./node";
// import { CpuProfileNodeView } from "./nodeView";
// import { CpuProfileNodeViewHierarchy } from "./nodeViewHierarchy";

// interface CommonFields {
//     readonly startTime: TimeSpan;
//     readonly endTime: TimeSpan;
//     readonly duration: TimeSpan;
// }

// interface LessCommonFields {
//     readonly head: CpuProfileNodeView;
//     readonly totalCount: number;
//     readonly averageSampleDuration: TimeSpan;
// }

// export class CpuProfileView {
//     readonly profile: CpuProfile;
//     readonly ranges: ReadonlyArray<Range<TimeSpan>>;
//     readonly hierarchy: CpuProfileNodeViewHierarchy;
//     readonly name: string;

//     private _keySelector: (node: CpuProfileNode) => string;
//     private _unbounded: boolean;
//     private _lazyCommonFields: Lazy<CommonFields>;
//     private _lazyLessCommonFields: Lazy<LessCommonFields>;
//     private _lazyLookup: Lazy<Lookup<string, CpuProfileNode>>;
//     private _aggregateViewMap = new Map<string, CpuProfileNodeView>();

//     constructor(profile: CpuProfile, keySelector: (node: CpuProfileNode) => string, ranges?: Iterable<Range<TimeSpan>>, name: string = "") {
//         this.hierarchy = new CpuProfileNodeViewHierarchy(this);
//         this.profile = profile;
//         this.name = name;
//         this._keySelector = keySelector;
//         if (ranges) {
//             this.ranges = Range.normalize(ranges);
//             this._unbounded = this.ranges.some(range => range.isUnbounded);
//         }
//         else {
//             this.ranges = [Range.unbounded()];
//             this._unbounded = true;
//         }
//         this._lazyCommonFields = Lazy.from(getCommonFields, this);
//         this._lazyLessCommonFields = Lazy.from(getLessCommonFields, this);
//         this._lazyLookup = Lazy.from(getLookup, this);
//     }

//     get startTime() { return this._lazyCommonFields.value.startTime; }
//     get endTime() { return this._lazyCommonFields.value.endTime; }
//     get duration() { return this._lazyCommonFields.value.duration; }
//     get head() { return this._lazyLessCommonFields.value.head; }
//     get totalCount() { return this._lazyLessCommonFields.value.totalCount; }
//     get averageSampleDuration() { return this._lazyLessCommonFields.value.averageSampleDuration; }

//     public static intersect(x: CpuProfileView | undefined, y: CpuProfileView | undefined) {
//         if (x === y) return x;
//         if (x === undefined) return y;
//         if (y === undefined) return x;
//         if (x.profile === y.profile && x._keySelector === y._keySelector) {
//             return x.slice(Range.intersect(x.ranges, y.ranges));
//         }
//         return undefined;
//     }

//     public static union(x: CpuProfileView | undefined, y: CpuProfileView | undefined) {
//         if (x === y) return x;
//         if (x === undefined) return y;
//         if (y === undefined) return x;
//         if (x.profile === y.profile && x._keySelector === y._keySelector) {
//             return x.slice(Range.union(x.ranges, y.ranges));
//         }
//         return undefined;
//     }

//     contains(node: CpuProfileNode) {
//         return node.profile === this.profile && (this._unbounded || node.occursWithin(this.ranges));
//     }

//     filterNodes(nodes: Iterable<CpuProfileNode>): Iterable<CpuProfileNode> {
//         return from(nodes)
//             .where(node => this.contains(node))
//             .distinct();
//     }

//     filterTimestamps(timestamps: Iterable<TimeSpan>): Iterable<TimeSpan> {
//         return from(timestamps)
//             .where(timestamp => this.ranges.some(range => range.includes(timestamp)));
//     }

//     sameKey(left: CpuProfileNodeView, right: CpuProfileNodeView) {
//         if (left.profile !== this.profile || right.profile !== this.profile) throw new Error("Wrong profile");
//         return left.profileView._keySelector === right.profileView._keySelector
//             && left.viewKey === right.viewKey;
//     }

//     keyFor(node: CpuProfileNode) {
//         if (node.profile !== this.profile) throw new Error("Wrong profile");
//         const keySelector = this._keySelector;
//         return keySelector(node);
//     }

//     slice(ranges: Iterable<Range<TimeSpan>>) {
//         return this.profile.aggregate(this._keySelector, ranges);
//     }

//     aggregate(keySelector: (node: CpuProfileNode) => string, ranges: Iterable<Range<TimeSpan>> = this.ranges) {
//         return this.profile.aggregate(keySelector, ranges);
//     }

//     viewFor(node: CpuProfileNode) {
//         if (!this.contains(node)) return undefined;
//         return this.viewForKey(this.keyFor(node));
//     }

//     viewsFor(nodes: Iterable<CpuProfileNode>) {
//         return from(this.filterNodes(nodes))
//             .select(this._keySelector)
//             .distinct()
//             .select(key => this.viewForKey(key))
//             .toHierarchy(this.hierarchy)
//             .whereDefined();
//     }

//     viewForKey(key: string) {
//         let view = this._aggregateViewMap.get(key);
//         if (!view) {
//             if (!this._lazyLookup.value.has(key)) return undefined;
//             this._aggregateViewMap.set(key, view = new CpuProfileNodeView(this, key, this._lazyLookup.value.get(key)));
//         }
//         return view;
//     }
// }

// function getCommonFields(view: CpuProfileView): CommonFields {
//     let startTime = TimeSpan.POSITIVE_INFINITY;
//     let endTime = TimeSpan.NEGATIVE_INFINITY;

//     for (const range of view.ranges) {
//         const left = range.clampLeft(TimeSpan.NEGATIVE_INFINITY, TimeSpan.POSITIVE_INFINITY);
//         const right = range.clampRight(TimeSpan.NEGATIVE_INFINITY, TimeSpan.POSITIVE_INFINITY);
//         if (left.compareTo(right) > 0) continue;
//         startTime = TimeSpan.min(startTime, left);
//         endTime = TimeSpan.max(endTime, right);
//     }

//     startTime = TimeSpan.max(startTime, view.profile.startTime);
//     endTime = TimeSpan.min(endTime, view.profile.endTime);
//     const duration = endTime.subtract(startTime);
//     return { startTime, endTime, duration };
// }

// function getLessCommonFields(view: CpuProfileView): LessCommonFields {
//     const head = view.viewFor(view.profile.head);
//     if (!head) throw new Error("Could not aggreate the head node.");
//     const totalCount = head.totalCount;
//     const averageSampleDuration = view.duration.scale(1 / totalCount);
//     return { head, totalCount, averageSampleDuration };
// }

// function getLookup(view: CpuProfileView): Lookup<string, CpuProfileNode> {
//     return from(view.filterNodes(view.profile.nodes()))
//         .toLookup(node => view.keyFor(node));
// }

export {};
