import * as inspector from "./inspector";
import { Profiler } from "./profiler";
import { Timeline } from "./timeline";

export interface SessionEvents extends inspector.SessionEvents {
    profilerEvent: (eventName: string) => void;
    profileCaptured: (profile: Profiler.Profile) => void;
}

export interface SessionActions extends inspector.SessionActions {
}

export class Session extends inspector.Session<SessionEvents> {
    public readonly id: string;
    private static _nextSessionId = 0;
    private _connected = false;
    // private _timelineEvents: string[] | undefined;
    // private _timelineTimestamps: [number, number][] | undefined;
    private _timelineProfiles: Profiler.Profile[] | undefined;
    private _timelineStarted = false;

    constructor() {
        super();
        this.id = `${Session._nextSessionId++}`;
        this.on("profileCaptured", (profile: Profiler.Profile) => {
            this.onProfileCaptured(profile);
        });
    }

    public connect() {
        if (this._connected) return;
        this._connected = true;
        super.connect();
    }

    public disconnect() {
        if (!this._connected) return;
        this._connected = false;
        super.disconnect();
    }

    public startTimeline() {
        if (this._timelineStarted) return;
        this._timelineStarted = true;
        // this._timelineEvents = [];
        // this._timelineTimestamps = [];
        this._timelineProfiles = [];
    }

    public stopTimeline() {
        if (!this._timelineStarted) return;
        this._timelineStarted = false;

        const timeline = new Timeline();
        const mainThread = timeline.fork(process.pid, 1);
        // mainThread.instant("TracingStartedInBrowser", Timeline.Category.disabledByDefault_timeline, 0, { args: { data: { sessionId: this.id } }, scope: Timeline.Scope.thread });
        mainThread.metadata("TracingStartedInPage", Timeline.Category.disabledByDefault_timeline, 0, {
            data: { sessionId: this.id },
        });
        mainThread.metadata("thread_name", Timeline.Category.metadata, 0, { name: "Thread 1" });

        // for (let i = 0; i < this._timelineEvents!.length; i++) {
        //     mainThread.mark(this._timelineEvents![i], Timeline.Category.timeline, this._timelineTimestamps![i]);
        //     mainThread.instant("TimeStamp", Timeline.Category.timeline, this._timelineTimestamps![i], { args: { data: { message: this._timelineEvents![i] } }});
        // }

        for (const cpuProfile of this._timelineProfiles!) {
            mainThread.cpuProfile(cpuProfile, /*simulateTimelineEvents*/ true, this.id);
        }

        // this._timelineEvents = undefined;
        // this._timelineTimestamps = undefined;
        this._timelineProfiles = undefined;
        return timeline;
    }

    // private onProfilerEvent(eventName: string) {
    //     if (this._timelineStarted) {
    //         this._timelineEvents!.push(eventName);
    //         this._timelineTimestamps!.push(process.hrtime());
    //     }

    //     this.emit("profilerEvent", eventName);
    // }

    private onProfileCaptured(profile: Profiler.Profile) {
        if (this._timelineStarted) {
            this._timelineProfiles!.push(profile);
        }
    }

    public postAsync<M extends keyof SessionActions>(
        method: M,
        ...args: SessionActions[M] extends (...args: infer A) => any ? A : any[]
    ): Promise<ReturnType<SessionActions[M]>> {
        const [param] = args;
        return new Promise<any>((resolve, reject) =>
            this.post(method, param, (err, value) => err ? reject(err) : resolve(value))
        );
    }
}
