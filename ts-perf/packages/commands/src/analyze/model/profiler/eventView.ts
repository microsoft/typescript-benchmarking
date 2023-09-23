import { fmt, TimeSpan } from "@ts-perf/api";
import chalk from "chalk";
import { from, Lazy } from "iterable-query";

import { Table } from "../../decorators";
import { CpuProfileNode } from "./node";
import { CpuProfile } from "./profile";

interface TableContext {
    profileDuration: TimeSpan;
    profileHitCount: number;
    selectionHitCount: number;
    selectionHitPercent: number;
    selectionDuration: TimeSpan;
    selectionHasBailouts: boolean;
}

@Table<CpuProfileEventView, TableContext>({
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
        { header: "boundary", expression: x => x.displayName },
        { header: "event range", expression: x => x.startEventName ? `${x.startEventName}..${x.endEventName}` : "" },
        {
            header: "self time",
            expression: x =>
                `${fmt.formatMilliseconds(x.selfTime)} ${
                    fmt.formatPercent(x.selfPercent, { pad: 7, color: chalk.gray })
                }`,
            align: "right",
        },
    ],
})
export class CpuProfileEventView {
    readonly profile: CpuProfile;
    readonly displayName: string;
    readonly startEventName: string;
    readonly endEventName: string;
    readonly nodes: readonly CpuProfileNode[];

    private _lazyCommonFields = Lazy.from(getCommonFields, this);

    constructor(
        profile: CpuProfile,
        displayName: string,
        startEventName: string,
        endEventName: string,
        nodes: readonly CpuProfileNode[],
    ) {
        this.profile = profile;
        this.displayName = displayName;
        this.startEventName = startEventName;
        this.endEventName = endEventName;
        this.nodes = nodes;
    }

    get selfCount() {
        return this._lazyCommonFields.value.selfCount;
    }
    get selfTime() {
        return this.profile.averageSampleDuration.scale(this.selfCount);
    }
    get selfPercent() {
        return this.selfCount / this.profile.totalCount;
    }
    get bailoutCount(): number {
        return this._lazyCommonFields.value.bailoutCount;
    }
    get bailoutReason(): string {
        return this._lazyCommonFields.value.bailoutReason;
    }
}

function getCommonFields(file: CpuProfileEventView) {
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
