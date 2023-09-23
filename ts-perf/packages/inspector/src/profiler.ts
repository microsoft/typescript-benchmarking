import { StrictEventEmitter } from "@ts-perf/events";

import * as inspector from "./inspector";
import { Runtime } from "./runtime";
import { Session } from "./session";
import { ProfileTrimmer } from "./visitors/profileTrimmer";
import { SourceMapper } from "./visitors/sourceMapper";

export interface ProfilerEvents {
    /**
     * Sent when new profile recording is started using console.profile() call.
     */
    consoleProfileStarted: (param: Profiler.ConsoleProfileStartedEventDataType) => void;
    consoleProfileFinished: (param: Profiler.ConsoleProfileFinishedEventDataType) => void;
    progress: (message: string) => void;
}

export class Profiler extends StrictEventEmitter<ProfilerEvents> {
    public readonly session: Session;
    private _startTime: [number, number] | undefined;

    constructor(session: Session) {
        super();
        this.session = session;
        this.session.on(
            "Profiler.consoleProfileStarted",
            message => this.emit("consoleProfileStarted", message.params),
        );
        this.session.on(
            "Profiler.consoleProfileFinished",
            message => this.emit("consoleProfileFinished", message.params),
        );
    }

    public enable() {
        return this.session.postAsync("Profiler.enable");
    }

    public disable() {
        return this.session.postAsync("Profiler.disable");
    }

    /**
     * Changes CPU profiler sampling interval. Must be called before CPU profiles recording
     * started.
     */
    public setSamplingInterval(interval: number) {
        return this.session.postAsync("Profiler.setSamplingInterval", { interval });
    }

    public async start() {
        this._startTime = process.hrtime();
        await this.session.postAsync("Profiler.start");
    }

    public async stop(options: { sourceMap?: boolean; sourceRoot?: string; trim?: boolean; } = {}) {
        const result = await this.session.postAsync("Profiler.stop");
        const profile = this.finishProfile(result.profile, options.sourceMap, options.sourceRoot, options.trim);
        this.session.emit("profileCaptured", profile);
        return profile;
    }

    private finishProfile(profile: Profiler.Profile, sourceMap?: boolean, sourceRoot?: string, trim?: boolean) {
        if (trim) {
            this.emit("progress", "Trimming natives...");
            profile = ProfileTrimmer.trimProfile(profile, {
                trimNatives: true,
                trimNode: true,
                trimMocha: true,
                trimProfiler: true,
                trimExtraneous: true,
                trimExternal: true,
            });
        }
        if (sourceMap) {
            this.emit("progress", "Applying source maps...");
            profile = SourceMapper.mapProfile(profile, sourceRoot);
        }

        const startTime = Profiler.hrtimeToTimestamp(this._startTime!);
        if (profile.startTime > 0) {
            const delta = profile.startTime - startTime;
            profile.startTime -= delta;
            profile.endTime -= delta;
        }

        return profile;
    }

    /**
     * Enable precise code coverage. Coverage data for JavaScript executed before enabling precise
     * code coverage may be incomplete. Enabling prevents running optimized code and resets
     * execution counters.
     * @experimental
     */
    public startPreciseCoverage(callCount?: boolean) {
        return this.session.postAsync("Profiler.startPreciseCoverage", { callCount });
    }

    /**
     * Disable precise code coverage. Disabling releases unnecessary execution count records and
     * allows executing optimized code.
     * @experimental
     */
    public stopPreciseCoverage() {
        return this.session.postAsync("Profiler.stopPreciseCoverage");
    }

    /**
     * Collect coverage data for the current isolate, and resets execution counters. Precise code
     * coverage needs to have started.
     * @experimental.
     */
    public async takePreciseCoverage() {
        return (await this.session.postAsync("Profiler.takePreciseCoverage")).result;
    }

    /**
     * Collect coverage data for the current isolate. The coverage data may be incomplete due to
     * garbage collection.
     * @experimental
     */
    public async getBestEffortCoverage() {
        return (await this.session.postAsync("Profiler.getBestEffortCoverage")).result;
    }
}

export namespace Profiler {
    export import Profile = inspector.Profiler.Profile;
    export import ProfileNode = inspector.Profiler.ProfileNode;
    export import PositionTickInfo = inspector.Profiler.PositionTickInfo;
    export import CoverageRange = inspector.Profiler.CoverageRange;
    export import FunctionCoverage = inspector.Profiler.FunctionCoverage;
    export import ScriptCoverage = inspector.Profiler.ScriptCoverage;
    export import StopReturnType = inspector.Profiler.StopReturnType;
    export import TakePreciseCoverageReturnType = inspector.Profiler.TakePreciseCoverageReturnType;
    export import GetBestEffortCoverageReturnType = inspector.Profiler.GetBestEffortCoverageReturnType;
    export import ConsoleProfileStartedEventDataType = inspector.Profiler.ConsoleProfileStartedEventDataType;
    export import ConsoleProfileFinishedEventDataType = inspector.Profiler.ConsoleProfileFinishedEventDataType;

    const MICROSECONDS_PER_SECOND = 1e6;
    const NANOSECONDS_PER_SECOND = 1e9;
    const NANOSECONDS_PER_MICROSECOND = 1e3;

    export function hrtimeToTimestamp(hrtime: [number, number]): Runtime.Timestamp {
        let seconds = Math.trunc(hrtime[0]);
        let nanoseconds = Math.trunc(hrtime[1]);
        while (nanoseconds < 0) seconds -= 1, nanoseconds += NANOSECONDS_PER_SECOND;
        while (nanoseconds >= NANOSECONDS_PER_SECOND) seconds += 1, nanoseconds -= NANOSECONDS_PER_SECOND;
        const value = Math.floor(seconds * MICROSECONDS_PER_SECOND + nanoseconds / NANOSECONDS_PER_MICROSECOND);
        return value === 0 ? 0 : value;
    }
}

export import Profile = inspector.Profiler.Profile;
export import ProfileNode = inspector.Profiler.ProfileNode;
export import PositionTickInfo = inspector.Profiler.PositionTickInfo;
export import CoverageRange = inspector.Profiler.CoverageRange;
export import FunctionCoverage = inspector.Profiler.FunctionCoverage;
export import ScriptCoverage = inspector.Profiler.ScriptCoverage;
