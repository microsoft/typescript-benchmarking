// import { from, Lazy } from "iterable-query";
// import { CpuProfile } from "./profile";
// import { TimeSpan } from "@ts-perf/api";
// import { CpuProfileEventRangeView } from "./eventRangeView";

// export class CpuProfileEventRangesView {
//     readonly profile: CpuProfile;
//     readonly name: string;

//     private _lazyEvents: Lazy<ReadonlyArray<CpuProfileEventRangeView>>;

//     constructor(profile: CpuProfile, name = "") {
//         this.profile = profile;
//         this.name = name;
//         this._lazyEvents = Lazy.from(getEvents, this);
//     }

//     get events(): ReadonlyArray<CpuProfileEventRangeView> {
//         return this._lazyEvents.value;
//     }
// }

// function getEvents(view: CpuProfileEventRangesView): ReadonlyArray<CpuProfileEventRangeView> {
//     const parseSamplesAndTimestamps: [number, TimeSpan][] = [];
//     const bindSamplesAndTimestamps: [number, TimeSpan][] = [];
//     const checkSamplesAndTimestamps: [number, TimeSpan][] = [];
//     const emitSamplesAndTimestamps: [number, TimeSpan][] = [];
//     const otherSamplesAndTimestamps: [number, TimeSpan][] = [];
//     const parseRanges = view.profile.events.getRanges("beforeProgram", "afterProgram");
//     const bindRanges = view.profile.events.getRanges("beforeBind", "afterBind");
//     const checkRanges = view.profile.events.getRanges("beforeCheck", "afterCheck");
//     const emitRanges = view.profile.events.getRanges("beforeEmit", "afterEmit");
//     outer: for (const [sample, timestamp] of from(view.profile.samples)
//                                             .zip(view.profile.timestamps)) {
//         for (const range of parseRanges) {
//             if (range.includes(timestamp)) {
//                 parseSamplesAndTimestamps.push([sample, timestamp]);
//                 continue outer;
//             }
//         }
//         for (const range of bindRanges) {
//             if (range.includes(timestamp)) {
//                 bindSamplesAndTimestamps.push([sample, timestamp]);
//                 continue outer;
//             }
//         }
//         for (const range of checkRanges) {
//             if (range.includes(timestamp)) {
//                 checkSamplesAndTimestamps.push([sample, timestamp]);
//                 continue outer;
//             }
//         }
//         for (const range of emitRanges) {
//             if (range.includes(timestamp)) {
//                 emitSamplesAndTimestamps.push([sample, timestamp]);
//                 continue outer;
//             }
//         }
//         otherSamplesAndTimestamps.push([sample, timestamp]);
//     }
//     return [
//         new CpuProfileEventRangeView(view, "Parse", "beforeProgram", "afterProgram", parseSamplesAndTimestamps),
//         new CpuProfileEventRangeView(view, "Bind", "beforeBind", "afterBind", bindSamplesAndTimestamps),
//         new CpuProfileEventRangeView(view, "Check", "beforeCheck", "afterCheck", checkSamplesAndTimestamps),
//         new CpuProfileEventRangeView(view, "Emit", "beforeEmit", "afterEmit", emitSamplesAndTimestamps),
//         new CpuProfileEventRangeView(view, "Other", "", "", otherSamplesAndTimestamps),
//     ];
// }

export {};
