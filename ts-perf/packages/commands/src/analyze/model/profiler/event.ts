import { fmt, TimeSpan } from "@ts-perf/api";
import chalk from "chalk";
import { from, Lazy } from "iterable-query";

import { Table } from "../../decorators";
import { CpuProfileEvents } from "./events";
import { CpuProfile } from "./profile";

interface TableContext {
    readonly hitCount: number;
}

@Table<CpuProfileEvent, TableContext>({
    createContext: ([{ profileEvents: { hitCount } }]) => {
        return { hitCount };
    },
    headers: [
        { expression: ({ hitCount }) => `events (total): ${hitCount}` },
    ],
    columns: [
        { header: "event", key: "eventName" },
        {
            header: "total count",
            expression: x => `${x.hitCount} ${fmt.formatPercent(x.hitPercent, { pad: 7, color: chalk.gray })}`,
            align: "right",
        },
    ],
})
export class CpuProfileEvent {
    readonly profile: CpuProfile;
    readonly profileEvents: CpuProfileEvents;
    readonly eventName: string;
    readonly timestamps: readonly TimeSpan[];
    readonly hitCount: number;

    private _lazyCommonFields = Lazy.from(getCommonFields, this);

    constructor(profileEvents: CpuProfileEvents, eventName: string, timestamps: Iterable<TimeSpan>) {
        this.profileEvents = profileEvents;
        this.profile = profileEvents.profile;
        this.eventName = eventName;
        this.timestamps = from(timestamps).toArray();
        this.hitCount = this.timestamps.length;
    }

    get startTime() {
        return this._lazyCommonFields.value.startTime;
    }
    get endTime() {
        return this._lazyCommonFields.value.endTime;
    }
    get hitPercent() {
        return this.hitCount / this.profileEvents.hitCount;
    }
}

function getCommonFields(event: CpuProfileEvent) {
    const startTime = from(event.timestamps).min() || TimeSpan.NaN;
    const endTime = from(event.timestamps).max() || TimeSpan.NaN;
    return { startTime, endTime };
}
