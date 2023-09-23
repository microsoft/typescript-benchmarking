// import { padLeft, formatPercent, TimeSpan } from "@ts-perf/api";
// import { from, Lazy } from "iterable-query";
// import { Table } from "../../decorators";
// import { CpuProfile } from "./profile";
// import { CpuProfileView } from "./profileView";
// import { CpuProfileNodeView } from "./nodeView";
// import { CpuProfileLineTick } from "./lineTick";
// import chalk = require("chalk");

// interface TableContext {
//     readonly profile: CpuProfile;
//     readonly hitCount: number;
//     readonly duration: TimeSpan;
// }

// @Table<CpuProfileLineTickView, TableContext>({
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
//         { by: x => `${x.nodeView.functionName || `(anonymous function)`} ${chalk.gray(`(${x.nodeView.location})`)}` }
//     ],
//     columns: [
//         { header: "line",
//           expression: x => x.location },
//         { header: "function ticks",
//           expression: x => `${x.ticks} ${padLeft(chalk.gray(formatPercent(x.ticks / x.nodeView.lineTickCount)), 7)}`,
//           align: "right" },
//         { header: "self time",
//           expression: (x, _, { hitCount }) => `${x.duration.totalMilliseconds.toFixed(1)} ms ${padLeft(chalk.gray(formatPercent(x.ticks / hitCount)), 7)}`,
//           align: "right" },
//     ]
// })
// export class CpuProfileLineTickView {
//     readonly profile: CpuProfile;
//     readonly profileView: CpuProfileView;
//     readonly nodeView: CpuProfileNodeView;
//     readonly lines: ReadonlyArray<CpuProfileLineTick>;
//     readonly lineNumber: number;
//     readonly ticks: number;
//     readonly duration: TimeSpan;

//     constructor(nodeView: CpuProfileNodeView, lines: Iterable<CpuProfileLineTick>) {
//         this.nodeView = nodeView;
//         this.profileView = nodeView.profileView;
//         this.profile = nodeView.profile;
//         this.lines = from(lines).toArray();
//         if (this.lines.length === 0) {
//             this.lineNumber = -1;
//             this.ticks = 0;
//         }
//         else {
//             this.lineNumber = this.lines[0].lineNumber;
//             this.ticks = from(this.lines).sum(line => line.ticks);
//         }
//         this.duration = this.profile.averageSampleDuration.scale(this.ticks);
//     }

//     get location() { return `${this.nodeView.url}:${this.lineNumber}`; }
// }
