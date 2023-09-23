// import { from, Lazy } from "iterable-query";
// import { CpuProfileEventRangesView } from "./eventRangesView";
// import { CpuProfile } from "./profile";
// import { TimeSpan, padLeft, formatPercent } from "@ts-perf/api";
// import { Table } from "../../decorators";
// import chalk = require("chalk");

// interface CommonFields {
//     readonly startTime: TimeSpan;
//     readonly endTime: TimeSpan;
// }

// interface CpuProfileEventRangeViewTableContext {
//     readonly profile: CpuProfile;
// }

// @Table<CpuProfileEventRangeView, CpuProfileEventRangeViewTableContext>({
//     createContext: ([{ profile }]) => ({ profile }),
//     headers: [
//         { expression: ({ profile }) => `duration (total): ${profile.duration.totalMilliseconds.toFixed(1)} ms, ${profile.totalCount} samples` },
//     ],
//     columns: [
//         { header: "boundary",
//           expression: x => x.displayName },
//         { header: "event range",
//           expression: x => x.startEventName ? `${x.startEventName}..${x.endEventName}` : "" },
//         { header: "self time",
//           expression: (x, _, { profile }) => `${x.selfTime.totalMilliseconds.toFixed(1)} ms ${padLeft(chalk.gray(formatPercent(x.selfCount / profile.totalCount)), 7)}`,
//           align: "right" },
//     ]
// })
// export class CpuProfileEventRangeView {
//     readonly profile: CpuProfile;
//     readonly profileEventRangesView: CpuProfileEventRangesView;
//     readonly displayName: string;
//     readonly startEventName: string;
//     readonly endEventName: string;
//     readonly samples: ReadonlyArray<number>;
//     readonly timestamps: ReadonlyArray<TimeSpan>;
//     readonly selfCount: number;
//     readonly selfTime: TimeSpan;

//     private _lazyCommonFields = Lazy.from(getCommonFields, this);

//     constructor(profileEventRangesView: CpuProfileEventRangesView, displayName: string, startEventName: string, endEventName: string, samplesAndTimestamps: ReadonlyArray<[number, TimeSpan]>) {
//         this.profileEventRangesView = profileEventRangesView;
//         this.profile = profileEventRangesView.profile;
//         this.displayName = displayName;
//         this.startEventName = startEventName;
//         this.endEventName = endEventName;
//         [this.samples = [], this.timestamps = []] =
//             from(samplesAndTimestamps)
//                 .orderBy(pair => pair[1])
//                 .unzip();
//         this.selfCount = samplesAndTimestamps.length;
//         this.selfTime = this.profile.averageSampleDuration.scale(this.selfCount);
//     }

//     get startTime(): TimeSpan { return this._lazyCommonFields.value.startTime; }
//     get endTime(): TimeSpan { return this._lazyCommonFields.value.endTime; }
// }

// function getCommonFields(view: CpuProfileEventRangeView): CommonFields {
//     const startTime = from(view.timestamps).first() || TimeSpan.NaN;
//     const endTime = from(view.timestamps).last() || TimeSpan.NaN;
//     return { startTime, endTime };
// }

export {};
