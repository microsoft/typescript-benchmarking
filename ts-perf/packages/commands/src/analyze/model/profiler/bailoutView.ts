import chalk from "chalk";

import { Table } from "../../decorators";
import { CpuProfileFunctionView } from "./functionView";
import { CpuProfileNode } from "./node";
import { CpuProfile } from "./profile";

@Table<BailoutView<CpuProfileNode | CpuProfileFunctionView>, {}>({
    createContext: () => ({}),
    columns: [
        {
            header: "function",
            expression: x => `${x.functionName || "(anonymous function)"} ${chalk.gray(`(${x.location})`)}`,
        },
        { header: "count", expression: x => x.count, align: "right" },
        { header: "reason", expression: x => x.reason },
    ],
})
export class BailoutView<TOwner extends CpuProfileNode | CpuProfileFunctionView> {
    readonly profile: CpuProfile;
    readonly owner: TOwner;
    readonly reason: string;
    readonly nodes: readonly CpuProfileNode[];
    readonly count: number;

    constructor(owner: TOwner, reason: string, nodes: readonly CpuProfileNode[]) {
        this.owner = owner;
        this.profile = owner.profile;
        this.reason = reason;
        this.nodes = nodes;
        this.count = nodes.length;
    }

    get functionName() {
        return this.owner.functionName;
    }
    get location() {
        return this.owner.location;
    }
}
