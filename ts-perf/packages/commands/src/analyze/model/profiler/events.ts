import { Range, TimeSpan } from "@ts-perf/api";
import { ReadonlyTimeline } from "@ts-perf/inspector";
import { fn, from, Lazy } from "iterable-query";

import { CpuProfileEvent } from "./event";
import { CpuProfile } from "./profile";

interface CommonFields {
    readonly markers: readonly string[];
    readonly timestamps: readonly TimeSpan[];
}

export class CpuProfileEvents {
    readonly profile: CpuProfile;
    readonly timeline: ReadonlyTimeline;

    private _lazyCommonFields = Lazy.from(getCommonFields, this);
    private _lazyEvents = Lazy.from(getEvents, this);
    private _lazyEventMap = Lazy.from(getEventMap, this);
    private _eventRangeCache = new Map<string, readonly Range<TimeSpan>[]>();

    constructor(profile: CpuProfile) {
        this.profile = profile;
        this.timeline = profile.timeline;
    }

    get markers() {
        return this._lazyCommonFields.value.markers;
    }
    get timestamps() {
        return this._lazyCommonFields.value.timestamps;
    }
    get hitCount() {
        return this.timestamps.length;
    }
    get events() {
        return this._lazyEvents.value;
    }

    getEvent(eventName: string) {
        return this._lazyEventMap.value.get(eventName);
    }

    getRanges(startEventName: string, endEventName: string): Range<TimeSpan>[] {
        const key = JSON.stringify({ startEventName, endEventName });
        let ranges = this._eventRangeCache.get(key);
        if (!ranges) this._eventRangeCache.set(key, ranges = this._getRanges(startEventName, endEventName));
        return ranges.slice();
    }

    private _getRanges(startEventName: string, endEventName: string): readonly Range<TimeSpan>[] {
        const startEvent = this.getEvent(startEventName);
        const startEventTimestamps = startEvent
            && from(startEvent.timestamps)
                .orderBy(x => x)
                .toArray();

        const endEvent = this.getEvent(endEventName);
        const endEventTimestamps = endEvent
            && from(endEvent.timestamps)
                .orderBy(x => x)
                .toArray();

        if (!startEventTimestamps) {
            if (!endEventTimestamps) return [Range.unbounded<TimeSpan>()];
            const endTime = from(endEventTimestamps)
                .max()!;
            return [new Range(Range.leftUnbounded, endTime)];
        }
        else if (!endEventTimestamps) {
            const startTime = from(startEventTimestamps)
                .min()!;
            return [new Range(startTime, Range.rightUnbounded)];
        }

        const ranges: Range<TimeSpan>[] = [];
        const numEndEventTimestamps = endEventTimestamps.length;
        let endEventTimestampIndex = 0;
        for (const startTimestamp of startEventTimestamps) {
            while (endEventTimestampIndex < numEndEventTimestamps) {
                const endTimestamp = endEventTimestamps[endEventTimestampIndex];
                if (endTimestamp >= startTimestamp) {
                    ranges.push(new Range(startTimestamp, endTimestamp));
                    break;
                }
                endEventTimestampIndex++;
            }
            if (endEventTimestampIndex >= numEndEventTimestamps) {
                break;
            }
        }

        return Range.normalize(ranges);
    }
}

function getCommonFields(profileEvents: CpuProfileEvents): CommonFields {
    const timestampEvents = from(profileEvents.timeline.marks())
        .orderBy(event => event.ts)
        .select(event => fn.tuple(event.name, TimeSpan.fromMicroseconds(event.ts)))
        .toArray();
    const [markers, timestamps] = from(timestampEvents)
        .unzip();
    return { markers, timestamps };
}

function getEvents(profileEvents: CpuProfileEvents) {
    return from(profileEvents.markers)
        .zip(profileEvents.timestamps)
        .groupBy(
            pair => pair[0],
            pair => pair[1],
            (eventName, timestamps) => new CpuProfileEvent(profileEvents, eventName, timestamps),
        )
        .toArray();
}

function getEventMap(profileEvents: CpuProfileEvents) {
    return from(profileEvents.events)
        .toMap(event => event.eventName);
}
