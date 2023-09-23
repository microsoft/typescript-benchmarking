import { fmt } from "@ts-perf/api";
import chalk from "chalk";

import { Table } from "../../decorators";
import { CpuProfileFunctionView } from "./functionView";
import { Location } from "./location";
import { CpuProfileNode } from "./node";
import { CpuProfile } from "./profile";

@Table<PositionTickInfoView<CpuProfileNode | CpuProfileFunctionView>, {}>({
    createContext: () => ({}),
    columns: [
        {
            header: "function",
            expression: x => `${x.functionName || "(anonymous function)"} ${chalk.gray(`(${x.location})`)}`,
        },
        {
            header: `time (% of function)`,
            expression: x =>
                `${fmt.formatMilliseconds(x.duration)} ${
                    fmt.formatPercent(x.tickPercent, { pad: 7, color: chalk.gray })
                }`,
            align: "right",
        },
    ],
})
export class PositionTickInfoView<TOwner extends CpuProfileNode | CpuProfileFunctionView> {
    readonly profile: CpuProfile;
    readonly owner: TOwner;
    readonly nodes: readonly CpuProfileNode[];
    readonly ticks: number;
    readonly location: Location;

    constructor(owner: TOwner, nodes: readonly CpuProfileNode[], lineNumber: number, ticks: number) {
        this.owner = owner;
        this.profile = owner.profile;
        this.nodes = nodes;
        this.ticks = ticks;
        this.location = new Location(owner.url, lineNumber);
    }

    get duration() {
        return this.profile.averageSampleDuration.scale(this.ticks);
    }
    get functionName() {
        return this.nodes[0].functionName;
    }
    get tickPercent() {
        return this.owner.positionTickCount === 0 ? 0 : this.ticks / this.owner.positionTickCount;
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
}
