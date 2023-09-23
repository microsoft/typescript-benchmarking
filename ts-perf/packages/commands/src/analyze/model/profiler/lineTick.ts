// import { Lazy, from } from "iterable-query";
// import { PositionTickInfo } from "@ts-perf/inspector";
// import { CpuProfile } from "./profile";
// import { CpuProfileNode } from "./node";
// import { TimeSpan, formatPercent, padLeft } from "@ts-perf/api";
// import { Table } from "../../decorators";
// import chalk = require("chalk");
// import { Location } from "./location";

// interface CpuProfileLineTickTableContext {
//     readonly profile: CpuProfile;
//     readonly hitCount: number;
//     readonly duration: TimeSpan;
// }

// @Table<CpuProfileLineTick, CpuProfileLineTickTableContext>({
//     createContext: values => {
//         const profile = values[0].profile;
//         const hitCount = from(values).sum(node => node.ticks);
//         const duration = profile.averageSampleDuration.scale(hitCount);
//         return { profile, hitCount, duration };
//     },
//     headers: [
//         { expression: ({ profile }) => `duration (total): ${profile.duration.totalMilliseconds.toFixed(1)} ms, ${profile.totalCount} samples` },
//         { expression: ({ profile, hitCount, duration }) => `duration (selection): ${duration.totalMilliseconds.toFixed(1)} ms, ${hitCount} samples ${chalk.gray(`(${formatPercent(hitCount / profile.totalCount)} of total)`)}` }
//     ],
//     group: [
//         { by: x => `${x.node.functionName || `(anonymous function)`} ${chalk.gray(`(${x.node.location})`)}` }
//     ],
//     columns: [
//         { header: "line",
//           expression: x => x.location },
//         // { header: "function ticks",
//         //   expression: x => `${x.ticks} ${padLeft(chalk.gray(formatPercent(x.ticks / x.node.lineTickCount)), 7)}`,
//         //   align: "right" },
//         { header: "self time",
//           expression: (x, _, { hitCount }) => `${x.duration.totalMilliseconds.toFixed(1)} ms ${padLeft(chalk.gray(formatPercent(x.ticks / hitCount)), 7)}`,
//           align: "right" },
//     ]
// })
// export class CpuProfileLineTick {
//     readonly json: PositionTickInfo;
//     readonly profile: CpuProfile;
//     readonly node: CpuProfileNode;
//     readonly lineNumber: number;
//     readonly ticks: number;
//     readonly location: Location;

//     private _lazyDuration = Lazy.from(getDuration, this);

//     constructor(node: CpuProfileNode, json: PositionTickInfo) {
//         this.json = json;
//         this.node = node;
//         this.profile = node.profile;
//         this.lineNumber = json.line;
//         this.ticks = json.ticks;
//         this.location = new Location(node.location.url, this.lineNumber);
//     }

//     get duration() { return this._lazyDuration.value; }
// }

// function getDuration(line: CpuProfileLineTick) {
//     return line.profile.averageSampleDuration.scale(line.ticks);
// }
