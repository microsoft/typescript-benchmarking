import { Profiler } from "./profiler";
import { Runtime } from "./runtime";

export interface TimelineData {
    events?: Timeline.Event[];
    stackFrames?: Timeline.StackFrameMap;
}

export class TimelineView {
    private _processId: number | undefined;
    private _threadId: number | undefined;
    private _parent: TimelineView | undefined;
    private _data: TimelineData;

    protected constructor(data: TimelineData) {
        this._data = data;
    }

    get processId() {
        return this._processId;
    }

    get threadId() {
        return this._threadId;
    }

    get timeline(): Timeline | undefined {
        return this._parent && this._parent.timeline;
    }

    get parent() {
        return this._parent;
    }

    createBeginEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { args, sf, stack }: { args?: object; sf?: string | number; stack?: string[]; } = {},
    ): Timeline.BeginEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.begin,
            cat: toCategories(categories),
            name,
            args,
            sf,
            stack,
        };
    }

    begin(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { args, sf, stack }: { args?: object; sf?: string | number; stack?: string[]; } = {},
    ) {
        return this.addEvent(this.createBeginEvent(name, categories, timestamp, { args, sf, stack }));
    }

    createEndEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { args, sf, stack }: { args?: object; sf?: string | number; stack?: string[]; } = {},
    ): Timeline.EndEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.end,
            cat: toCategories(categories),
            name,
            args,
            sf,
            stack,
        };
    }

    end(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { args, sf, stack }: { args?: object; sf?: string | number; stack?: string[]; } = {},
    ) {
        return this.addEvent(this.createEndEvent(name, categories, timestamp, { args, sf, stack }));
    }

    createCompleteEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        dur: number,
        { args, tdur }: { args?: object; tdur?: number; } = {},
    ): Timeline.CompleteEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.complete,
            cat: toCategories(categories),
            name,
            dur,
            tdur,
            args,
        };
    }

    complete(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        dur: number,
        { args, tdur }: { args?: object; tdur?: number; } = {},
    ) {
        return this.addEvent(this.createCompleteEvent(name, categories, timestamp, dur, { args, tdur }));
    }

    createInstantEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { scope, args }: { scope?: Scope; args?: object; } = {},
    ): Timeline.InstantEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.instant,
            cat: toCategories(categories),
            name,
            s: scope,
            args,
        };
    }

    instant(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { scope, args }: { scope?: Scope; args?: object; } = {},
    ) {
        return this.addEvent(this.createInstantEvent(name, categories, timestamp, { scope, args }));
    }

    createSampleEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { scope, args, id, tts }: { scope?: Scope; args?: object; id?: string | number; tts?: number; } = {},
    ): Timeline.SampleEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.sample,
            cat: toCategories(categories),
            name,
            s: scope,
            args,
            tts,
            id,
        };
    }

    sample(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        { scope, args, id, tts }: { scope?: Scope; args?: object; id?: string | number; tts?: number; } = {},
    ) {
        return this.addEvent(this.createSampleEvent(name, categories, timestamp, { scope, args, id, tts }));
    }

    createCounterEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        args: Record<string, number>,
        { id }: { id?: string | number; } = {},
    ): Timeline.CounterEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.counter,
            cat: toCategories(categories),
            name,
            args,
            id,
        };
    }

    counter(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        args: Record<string, number>,
        { id }: { id?: string | number; } = {},
    ) {
        return this.addEvent(this.createCounterEvent(name, categories, timestamp, args, { id }));
    }

    createMarkEvent(
        name: string,
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
    ): Timeline.MarkEvent {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.mark,
            cat: toCategories(categories),
            name,
        };
    }

    mark(name: string, categories: Timeline.Categories | readonly Category[], timestamp: number | [number, number]) {
        return this.addEvent(this.createMarkEvent(name, categories, timestamp));
    }

    createMetadataEvent<M extends Timeline.MetadataEvent>(
        name: M["name"],
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        args: M["args"],
    ): M {
        return {
            pid: this.processId,
            tid: this.threadId,
            ts: toTimestamp(timestamp),
            ph: Phase.metadata,
            cat: toCategories(categories),
            name,
            args,
        } as M;
    }

    metadata<M extends Timeline.MetadataEvent>(
        name: M["name"],
        categories: Timeline.Categories | readonly Category[],
        timestamp: number | [number, number],
        args: M["args"],
    ) {
        return this.addEvent(this.createMetadataEvent(name, categories, timestamp, args));
    }

    cpuProfile(cpuProfile: Profiler.Profile, simulateTimelineEvents = false, sessionId = "1") {
        if (simulateTimelineEvents && cpuProfile.samples && cpuProfile.timeDeltas) {
            const idToNode = new Map<number, Profiler.ProfileNode>(
                cpuProfile.nodes.map(node => [node.id, node] as [number, Profiler.ProfileNode]),
            );
            let programEvent: Mutable<Timeline.CompleteEvent> | undefined;
            let functionEvent: Mutable<Timeline.CompleteEvent> | undefined;
            let currentTime = cpuProfile.startTime;
            const openProgramEvent = () => {
                if (!programEvent) {
                    this.addEvent(
                        programEvent = this.createCompleteEvent(
                            "MessageLoop::RunTask",
                            Timeline.Category.toplevel,
                            currentTime,
                            0,
                        ),
                    );
                }
            };
            const openFunctionEvent = () => {
                if (!functionEvent) {
                    this.addEvent(
                        functionEvent = this.createCompleteEvent(
                            "FunctionCall",
                            Timeline.Category.disabledByDefault_timeline,
                            currentTime,
                            0,
                            { args: { data: { sessionId } } },
                        ),
                    );
                }
            };
            const closeProgramEvent = () => {
                if (programEvent) {
                    programEvent.dur = currentTime - programEvent.ts;
                    programEvent = undefined;
                }
            };
            const closeFunctionEvent = () => {
                if (functionEvent) {
                    functionEvent.dur = currentTime - functionEvent.ts;
                    functionEvent = undefined;
                }
            };
            for (let i = 0; i < cpuProfile.samples.length; i++) {
                const node = idToNode.get(cpuProfile.samples[i])!;
                const name = node.callFrame.functionName;
                if (name === "(idle)") {
                    closeProgramEvent();
                    closeFunctionEvent();
                }
                else {
                    openProgramEvent();
                    if (name === "(program)") {
                        closeFunctionEvent();
                    }
                    else {
                        openFunctionEvent();
                    }
                }
                currentTime += cpuProfile.timeDeltas[i];
            }
            closeProgramEvent();
            closeFunctionEvent();
        }
        return this.instant("CpuProfile", Timeline.Category.disabledByDefault_timeline, cpuProfile.endTime, {
            args: { data: { cpuProfile } },
        });
    }

    profileStart(
        data: Timeline.ProfileHeader,
        timestamp: number | [number, number],
        id: string | number,
        { tts }: { tts?: number; } = {},
    ) {
        return this.sample("Profile", Timeline.Category.disabledByDefault_cpuProfiler, timestamp, {
            args: { data },
            tts,
            id,
        });
    }

    profileChunk(
        data: Timeline.ProfileChunk,
        timestamp: number | [number, number],
        id: string | number,
        { tts }: { tts?: number; } = {},
    ) {
        return this.sample("ProfileChunk", Timeline.Category.disabledByDefault_cpuProfiler, timestamp, {
            args: { data },
            tts,
            id,
        });
    }

    addEvent(event: Timeline.Event) {
        (this._data.events || (this._data.events = [])).push(event);
        return this;
    }

    addStackFrame(id: string | number, stackFrame: Timeline.StackFrame) {
        const stackFrames = this._data.stackFrames || (this._data.stackFrames = {});
        stackFrames[id] = stackFrame;
        return this;
    }

    fork(processId: number, threadId: number) {
        if (processId === this.processId && threadId === this.threadId) return this;
        const timeline = new TimelineView(this._data);
        timeline._parent = this;
        timeline._processId = processId;
        timeline._threadId = threadId;
        return timeline;
    }
}

export class Timeline extends TimelineView implements ReadonlyTimeline {
    private _timelineData: TimelineData;

    constructor(events?: Iterable<Timeline.Event>, stackFrames?: Timeline.StackFrameMap) {
        const data = { events: events && [...events], stackFrames: stackFrames && { ...stackFrames } };
        super(data);
        this._timelineData = data;
    }

    get size() {
        return this._timelineData.events ? this._timelineData.events.length : 0;
    }

    get timeline() {
        return this;
    }

    get(index: number) {
        return this._timelineData.events && this._timelineData.events[index];
    }

    delete(index: number) {
        if (this._timelineData.events && index >= 0 && index < this._timelineData.events.length) {
            for (let i = index + 1; i < this._timelineData.events.length; i++) {
                this._timelineData.events[i - 1] = this._timelineData.events[i];
            }
            this._timelineData.events.length--;
            return true;
        }
        return false;
    }

    indexOf(event: Timeline.Event) {
        return this._timelineData.events ? this._timelineData.events.indexOf(event) : -1;
    }

    find(predicate: (v: Timeline.Event) => boolean) {
        return this._timelineData.events ? this._timelineData.events.find(predicate) : undefined;
    }

    findIndex(predicate: (v: Timeline.Event) => boolean) {
        return this._timelineData.events ? this._timelineData.events.findIndex(predicate) : -1;
    }

    findEvent(eventName: string) {
        return this._timelineData.events
            ? this._timelineData.events.find(v => v.ph === Phase.mark && v.name === eventName) as
                | Timeline.MarkEvent
                | undefined : undefined;
    }

    getStackFrame(id: string | number) {
        return this._timelineData.stackFrames && this._timelineData.stackFrames[id];
    }

    // prune(startEventName: string | undefined, endEventName: string | undefined): Timeline {
    //     const timeline = new Timeline();
    //     if (!this._timelineData.events) {
    //         return timeline;
    //     }

    //     if (!startEventName && !endEventName) {
    //         if (this._timelineData.events) timeline._timelineData = cloneTimelineData(this._timelineData);
    //         return timeline;
    //     }

    //     const startEvent = startEventName ? this.findEvent(startEventName) : undefined;
    //     const startTime = startEventName ? startEvent ? startEvent.ts : maxInt32 : 0;
    //     const endEvent = endEventName ? this.findEvent(endEventName) : undefined;
    //     const endTime = endEventName && endEvent ? endEvent.ts : maxInt32;

    //     if (startTime > endTime) {
    //         return timeline;
    //     }

    //     if (startTime === 0 && endTime === maxInt32) {
    //         if (this._timelineData.events) timeline._timelineData = cloneTimelineData(this._timelineData);
    //         return timeline;
    //     }

    //     for (const event of this._timelineData.events) {
    //         if (event.ph === Phase.instant && event.name === "CpuProfile") {
    //             const profile = event.args && (<any>event.args).data && (<any>event.args).data.cpuProfile as Profiler.Profile;
    //             if (profile) {
    //                 const prunedProfile = this.pruneProfile(profile, startTime, endTime);
    //                 if (prunedProfile !== profile) {
    //                     timeline.cpuProfile(prunedProfile);
    //                     continue;
    //                 }
    //             }
    //         }
    //         else if (event.ph === Phase.profiler && event.name === "Profile") {
    //             const profile = event.args && (<any>event.args).data && (<any>event.args).data.cpuProfile as Profiler.Profile;
    //             if (profile) {
    //                 const prunedProfile = this.pruneProfile(profile, startTime, endTime);
    //                 if (prunedProfile !== profile) {
    //                     timeline.profile(prunedProfile, event.ts, event.id);
    //                     continue;
    //                 }
    //             }
    //         }
    //         else if (event.ph === Phase.profiler && event.name === "ProfileChunk") {
    //             const profile = event.args && (<any>event.args).data && (<any>event.args).data.cpuProfile as Profiler.Profile;
    //             if (profile) {
    //                 const prunedProfile = this.pruneProfile(profile, startTime, endTime);
    //                 if (prunedProfile !== profile) {
    //                     timeline.profileChunk(prunedProfile, event.ts, event.id!);
    //                     continue;
    //                 }
    //             }
    //         }
    //         else if (event.ts === 0 ||
    //             event.name !== "TimeStamp" ||
    //             event.ts >= startTime && event.ts <= endTime) {
    //             timeline.addEvent(event);
    //         }
    //     }

    //     return timeline;
    // }

    // private pruneProfile(profile: Profiler.Profile, startTime: number, endTime: number) {
    //     // collect timestamps for each node
    //     const nodeTimestamps = new Map<number, number[]>();
    //     const timestamps: number[] = [];
    //     let lastTimestamp = profile.startTime;
    //     for (let i = 0; i < profile.samples!.length; i++) {
    //         const id = profile.samples![i];
    //         lastTimestamp += profile.timeDeltas![i];
    //         timestamps.push(lastTimestamp);
    //         if (lastTimestamp >= startTime && lastTimestamp <= endTime) {
    //             let timestamps = nodeTimestamps.get(id);
    //             if (!timestamps) nodeTimestamps.set(id, timestamps = []);
    //             timestamps.push(lastTimestamp);
    //         }
    //     }

    //     // visit the profile node graph to determine whether to remove nodes
    //     const nodesToRemove = new Set<number>();
    //     (function visitProfileNode(id: number) {
    //         const node = profile.nodes[id];
    //         if (node.children) {
    //             if (!node.children.reduce((keep, childId) => visitProfileNode(childId) || keep, false)) {
    //                 nodesToRemove.add(id);
    //                 return false;
    //             }
    //         }
    //         else {
    //             if (!nodeTimestamps.has(id)) {
    //                 nodesToRemove.add(id);
    //                 return false;
    //             }
    //         }
    //         return true;
    //     })(0);

    //     // prune the profile
    //     let nodes: Profiler.ProfileNode[];
    //     let samples: number[] | undefined;
    //     let timeDeltas: number[] | undefined;
    //     if (nodesToRemove.size > 0) {
    //         nodes = [];
    //         samples = [];
    //         timeDeltas = [];

    //         // create the new set of nodes
    //         const oldIdToNewIdMap = new Map<number, number>();
    //         const newIdToOldIdMap = new Map<number, number>();
    //         for (let oldId = 0; oldId < profile.nodes.length; oldId++) {
    //             if (nodesToRemove.has(oldId)) continue;
    //             const oldNode = profile.nodes[oldId];
    //             const newId = nodes.length;
    //             const newNode: Profiler.ProfileNode = {
    //                 ...oldNode,
    //                 id: newId,
    //                 callFrame: oldNode.callFrame,
    //                 hitCount: 0,
    //                 deoptReason: oldNode.deoptReason,
    //                 positionTicks: oldNode.positionTicks
    //             };
    //             oldIdToNewIdMap.set(oldId, newId);
    //             newIdToOldIdMap.set(newId, oldId);
    //             nodes.push(newNode);
    //         }

    //         // update the children of each node
    //         for (let newId = 0; newId < nodes.length; newId++) {
    //             const oldId = oldIdToNewIdMap.get(newId)!;
    //             const oldNode = profile.nodes![oldId];
    //             if (oldNode.children) {
    //                 let newChildren: number[] | undefined;
    //                 for (const oldChildId of oldNode.children) {
    //                     if (nodesToRemove.has(oldChildId)) continue;
    //                     if (!newChildren) newChildren = [];
    //                     const newChildId = oldIdToNewIdMap.get(oldChildId)!;
    //                     newChildren.push(newChildId);
    //                 }
    //                 if (newChildren) {
    //                     nodes[newId].children = newChildren;
    //                 }
    //             }
    //         }

    //         // create an updated list of samples and time deltas
    //         let lastTimestamp = startTime;
    //         for (let i = 0; i < profile.samples!.length; i++) {
    //             const oldId = profile.samples![i];
    //             if (nodesToRemove.has(oldId)) continue;

    //             const newId = oldIdToNewIdMap.get(oldId)!;
    //             nodes[newId].hitCount!++;

    //             const oldTimestamp = timestamps[i];
    //             samples.push(newId);
    //             timeDeltas.push(oldTimestamp - lastTimestamp);
    //             lastTimestamp = oldTimestamp;
    //         }
    //     }
    //     else {
    //         nodes = profile.nodes;
    //         samples = profile.samples;
    //         timeDeltas = profile.timeDeltas;
    //     }

    //     return profile.startTime !== startTime ||
    //         profile.endTime !== endTime ||
    //         profile.nodes !== nodes ||
    //         profile.samples !== samples ||
    //         profile.timeDeltas !== timeDeltas
    //         ? {
    //             ...profile,
    //             nodes: nodes,
    //             startTime,
    //             endTime,
    //             samples: samples,
    //             timeDeltas: timeDeltas
    //         }
    //         : profile;
    // }

    *values() {
        if (this._timelineData.events) yield* this._timelineData.events.values();
    }

    *keys() {
        if (this._timelineData.events) yield* this._timelineData.events.keys();
    }

    *entries() {
        if (this._timelineData.events) yield* this._timelineData.events.entries();
    }

    *marks() {
        if (this._timelineData.events) {
            for (const event of this._timelineData.events) {
                if (event.ph === Phase.mark) yield event as Timeline.MarkEvent;
            }
        }
    }

    *cpuProfiles() {
        if (this._timelineData.events) {
            const profileEvents: Timeline.ProfileEvent[] = [];
            const profileChunkEvents: Timeline.ProfileChunkEvent[] = [];
            for (const event of this._timelineData.events) {
                if (event.ph === Phase.instant && event.name === "CpuProfile") {
                    yield (event as Timeline.CpuProfileEvent).args.data.cpuProfile;
                }
                else if (event.ph === Phase.sample && event.name === "Profile") {
                    profileEvents.push(event as Timeline.ProfileEvent);
                }
                else if (event.ph === Phase.sample && event.name === "ProfileChunk") {
                    profileChunkEvents.push(event as Timeline.ProfileChunkEvent);
                }
            }
            if (profileEvents.length) {
                const partialProfiles = new Map<string, Profiler.Profile>();
                profileEvents.sort((a, b) => a.ts - b.ts);
                for (const event of profileEvents) {
                    const startTime = event.args.data.startTime;
                    const profile: Profiler.Profile = { startTime, endTime: undefined!, nodes: [] };
                    updateProfile(profile, event.args.data, event.ts);
                    partialProfiles.set(event.id + "", profile);
                }
                if (profileChunkEvents.length) {
                    profileChunkEvents.sort((a, b) => a.ts - b.ts);
                    for (const event of profileChunkEvents) {
                        const profile = partialProfiles.get(event.id + "");
                        if (!profile) continue;
                        updateProfile(profile, event.args.data, event.ts);
                    }
                }
                for (const profile of partialProfiles.values()) {
                    if (profile.endTime === undefined) {
                        if (profile.timeDeltas) {
                            profile.endTime = profile.timeDeltas.reduce(
                                (memo, delta) => memo + delta,
                                profile.startTime,
                            );
                        }
                        else {
                            profile.endTime = profile.startTime;
                        }
                    }
                    yield profile;
                }
            }
        }

        function updateProfile(profile: Profiler.Profile, chunk: Timeline.ProfileChunk, ts: number) {
            if (chunk.startTime !== undefined) profile.startTime = chunk.startTime;
            if (chunk.endTime !== undefined) profile.endTime = chunk.endTime;
            if (chunk.cpuProfile !== undefined) {
                profile.nodes = combineArrays(profile.nodes, chunk.cpuProfile.nodes)!;
                profile.samples = combineArrays(profile.samples, chunk.cpuProfile.samples);
            }
            if (chunk.timeDeltas !== undefined) {
                profile.timeDeltas = combineArrays(profile.timeDeltas, chunk.timeDeltas);
            }
            if (ts > profile.endTime) profile.endTime = ts;
        }

        function combineArrays<T>(left: T[] | undefined, right: T[] | undefined) {
            if (left === undefined) return right && right.slice();
            if (right === undefined) return left && left.slice();
            return left.concat(right);
        }
    }

    *[Symbol.iterator]() {
        if (this._timelineData.events) yield* this._timelineData.events[Symbol.iterator]();
    }

    toArray() {
        return this._timelineData.events ? this._timelineData.events.slice() : [];
    }

    toJSON(): any {
        if (this._timelineData.stackFrames) {
            return {
                traceEvents: this.toArray(),
                stackFrames: { ...this._timelineData.stackFrames },
            };
        }
        return this.toArray();
    }

    toString() {
        const events = `[${this.toArray().map(event => JSON.stringify(event)).join(",\n")}]`;
        if (this._timelineData.stackFrames) {
            return `{"traceEvents":${events},\n"stackFrames":${JSON.stringify(this._timelineData.stackFrames)}}`;
        }
        return events;
    }

    static parse(text: string) {
        text = text.trim();
        if (text.startsWith("[") && !text.endsWith("]")) text += "]";
        const obj = JSON.parse(text);
        if (typeof obj === "object") {
            // JSON Array trace format
            if (Array.isArray(obj)) {
                return new Timeline(obj as Timeline.Event[]);
            }
            // JSON object trace format
            if (Array.isArray(obj.traceEvents)) {
                return new Timeline(obj.traceEvents, obj.stackFrames);
            }
            // CPU Profile-only format
            if (Array.isArray(obj.timeDeltas)) {
                return this.fromProfile(obj);
            }
            // Legacy CPU Profile-only format
            if (Array.isArray(obj.timestamps)) {
                return this.fromLegacyProfile(obj);
            }
        }
        throw new Error("Unrecognized format");
    }

    static fromProfile(cpuProfile: Profiler.Profile) {
        const timeline = new Timeline();
        const nodeProcess = timeline.fork(0, 0);
        const nodeMainThread = nodeProcess.fork(0, 1);
        const dur = cpuProfile.endTime - cpuProfile.startTime;
        nodeMainThread.metadata("TracingStartedInPage", Timeline.Category.disabledByDefault_timeline, 0, {
            data: { sessionId: "1" },
        });
        nodeMainThread.complete("MessageLoop::RunTask", Timeline.Category.toplevel, cpuProfile.startTime, dur, {
            args: { data: {} },
        });
        nodeMainThread.complete(
            "FunctionCall",
            Timeline.Category.disabledByDefault_timeline,
            cpuProfile.startTime,
            dur,
            { args: { data: { sessionId: "1" } } },
        );
        nodeMainThread.profileStart(
            {
                startTime: cpuProfile.startTime,
                endTime: cpuProfile.endTime,
                cpuProfile: {
                    nodes: cpuProfile.nodes,
                    samples: cpuProfile.samples,
                },
                timeDeltas: cpuProfile.timeDeltas,
            },
            cpuProfile.endTime,
            "0x1",
        );
        return timeline;
    }

    private static fromLegacyProfile(profile: LegacyProfile) {
        const timeline = new Timeline();
        const nodeProcess = timeline.fork(0, 0);
        const nodeMainThread = nodeProcess.fork(0, 1);
        const cpuProfile = LegacyProfileConverter.convert(profile);
        const dur = cpuProfile.endTime - cpuProfile.startTime;
        nodeMainThread.metadata("TracingStartedInPage", Timeline.Category.disabledByDefault_timeline, 0, {
            data: { sessionId: "1" },
        });
        const events = profile.events;
        if (events) {
            for (let i = 0; i < events.samples.length; i++) {
                const event = events.events[events.samples[i]];
                const timestamp = profile.startTime + events.timestamps[i];
                nodeMainThread.instant("TimeStamp", Timeline.Category.timeline, timestamp, {
                    args: { data: { message: event.eventName } },
                });
                nodeMainThread.mark(event.eventName, Timeline.Category.timeline, timestamp);
            }
        }
        nodeMainThread.complete("MessageLoop::RunTask", Timeline.Category.toplevel, cpuProfile.startTime, dur, {
            args: { data: {} },
        });
        nodeMainThread.complete(
            "FunctionCall",
            Timeline.Category.disabledByDefault_timeline,
            cpuProfile.startTime,
            dur,
            { args: { data: { sessionId: "1" } } },
        );
        nodeMainThread.profileStart(
            {
                startTime: cpuProfile.startTime,
                endTime: cpuProfile.endTime,
                cpuProfile: {
                    nodes: cpuProfile.nodes,
                    samples: cpuProfile.samples,
                },
                timeDeltas: cpuProfile.timeDeltas,
            },
            cpuProfile.endTime,
            "0x1",
        );
        return timeline;
    }
}

export interface ReadonlyTimeline {
    readonly processId: number | undefined;
    readonly threadId: number | undefined;
    readonly size: number;
    readonly timeline: ReadonlyTimeline;
    get(index: number): Timeline.Event | undefined;
    indexOf(event: Timeline.Event): number;
    find(predicate: (v: Timeline.Event) => boolean): Timeline.Event | undefined;
    findIndex(predicate: (v: Timeline.Event) => boolean): number;
    findEvent(eventName: string): Timeline.MarkEvent | undefined;
    getStackFrame(id: string | number): Timeline.StackFrame | undefined;
    // prune(startEventName: string | undefined, endEventName: string | undefined): Timeline;
    values(): IterableIterator<Timeline.Event>;
    keys(): IterableIterator<number>;
    entries(): IterableIterator<[number, Timeline.Event]>;
    marks(): IterableIterator<Timeline.MarkEvent>;
    cpuProfiles(): IterableIterator<Profiler.Profile>;
    toArray(): Timeline.Event[];
    toJSON(): any;
    [Symbol.iterator](): IterableIterator<Timeline.Event>;
}

export namespace Timeline {
    export const enum Phase {
        // Duration Events
        begin = "B",
        end = "E",

        // Complete Events
        complete = "X",

        // Instant events
        instant = "I",

        /** @deprecated */ zzz_instant = "i",

        // Sample events
        sample = "P",

        // Counter events
        counter = "C",

        // Async events
        asyncNestableStart = "b",
        asyncNestableInstant = "n",
        asyncNestableEnd = "e",

        /** @deprecated */ zzz_asyncStart = "S",
        /** @deprecated */ zzz_asyncStepInto = "T",
        /** @deprecated */ zzz_asyncStepPast = "p",
        /** @deprecated */ zzz_asyncEnd = "F",

        // Flow events
        flowStart = "s",
        flowStep = "t",
        flowEnd = "f",

        // Sample events
        /** @deprecated */ zzz_sample = "P",

        // Object events
        objectCreated = "N",
        objectSnapshot = "O",
        objectDestroyed = "D",

        // Metadata events
        metadata = "M",

        // Memory dump events
        globalMemoryDump = "V",
        processMemoryDump = "v",

        // Mark events
        mark = "R",

        // Clock sync events
        clockSync = "c",

        // Context events
        contextEnter = "(",
        contextLeave = ")",

        // Links
        link = "=",
    }

    /** The scope of the event. */
    export const enum Scope {
        global = "g",
        process = "p",
        thread = "t",
    }

    export const enum Category {
        metadata = "__metadata",
        toplevel = "toplevel",
        timeline = "devtools.timeline",
        cpuProfiler = "v8.cpu_profiler",
        disabledByDefault_timeline = "disabled-by-default-devtools.timeline",
        disabledByDefault_cpuProfiler = "disabled-by-default-v8.cpu_profiler",
    }

    export type Categories<C extends Category = Category> =
        | ((string | void) & { [" _commaSeparatedCategory"]: C; })
        | C;

    export function splitCategories<C extends Category>(cat: C | Categories<C>): C[] {
        return (cat as string)
            .split(",")
            .map(s => s.trim() as C);
    }

    export function joinCategories<C extends Category>(categories: readonly C[]): Categories<C> {
        return categories.join(",") as Categories<C>;
    }

    export interface ObjectReference {
        readonly id_ref: string | number;
        readonly scope?: string;
    }

    export interface EventBase {
        /** The name of the event, as displayed in Trace Viewer */
        readonly name?: string;
        /** The event categories. This is a comma separated list of categories for the event. The categories can be used to hide events in the Trace Viewer UI. */
        readonly cat?: Categories;
        /** The event type. This is a single character which changes depending on the type of event being output. */
        readonly ph: Phase;
        /** The tracing clock timestamp of the event. The timestamps are provided at microsecond granularity. */
        readonly ts: number;
        /** Optional. The thread clock timestamp of the event. The timestamps are provided at microsecond granularity. */
        readonly tts?: number;
        /** The process ID for the process that output this event. */
        readonly pid: number | undefined;
        /** The thread ID for the thread that output this event. */
        readonly tid: number | undefined;
        /** Any arguments provided for the event. Some of the event types have required argument fields, otherwise, you can put any information you wish in here. The arguments are displayed in Trace Viewer when you view an event in the analysis section. */
        readonly args?: object;
        /**  A fixed color name to associate with the event. If provided, cname must be one of the names listed in trace-viewer's base color scheme's reserved color names list */
        readonly cname?: string;
        // readonly dur?: number;
        // readonly tdur?: number;
        // readonly s?: string;
        // readonly id?: string;
        // readonly id2?: string;
    }

    export interface StackAwareEventBase extends EventBase {
        /** A reference to a stack frame in the "stackFrames" map. */
        readonly sf?: string | number;
        /** A stack array. */
        readonly stack?: readonly string[];
    }

    export interface BeginEndStackAwareEventBase extends StackAwareEventBase {
        /** A reference to a stack frame in the "stackFrames" map for the end stack trace of the event. */
        readonly esf?: string | number;
        /** A stack array for the end stack trace of the event. */
        readonly estack?: readonly string[];
    }

    export interface CorrelatedEventBase extends EventBase {
        /** An id used to correlate operations. Cannot be specified if 'id2' is specified. */
        readonly id: string | number | undefined;
        /** An id used to correlate operations. Cannot be specified if 'id' is specified. */
        readonly id2: { readonly local: string | number; } | { readonly global: string | number; } | undefined;
        /** An optional scope that can be used to avoid id conflicts. */
        readonly scope?: string;
    }

    // Duration events
    export type DurationEvent = BeginEvent | EndEvent;
    export interface BeginEvent extends StackAwareEventBase {
        readonly name: string;
        readonly cat: Categories;
        readonly ph: Phase.begin;
        readonly args?: object;
    }

    export interface EndEvent extends StackAwareEventBase {
        readonly ph: Phase.end;
        readonly args?: object;
    }

    // Complete events
    export interface CompleteEvent extends BeginEndStackAwareEventBase {
        readonly ph: Phase.complete;
        /** The tracing clock duration of the complete event in microseconds. */
        readonly dur: number;
        /** The thread clock duration of the complete event in microseconds. */
        readonly tdur?: number;
    }

    // Instant events
    export interface InstantEvent extends StackAwareEventBase {
        readonly ph: Phase.instant;
        /** The scope of the event. */
        readonly s?: Scope;
    }

    export interface CpuProfileEvent extends InstantEvent {
        readonly name: "CpuProfile";
        readonly args: { readonly data: { readonly cpuProfile: Profiler.Profile; }; };
    }

    // Sample events
    export interface SampleEvent extends StackAwareEventBase {
        readonly ph: Phase.sample;
        /** The scope of the event. */
        readonly s?: Scope;
        readonly id?: string | number;
    }

    export interface ProfileChunk {
        readonly startTime?: number;
        readonly endTime?: number;
        readonly cpuProfile?: { readonly nodes?: Profiler.ProfileNode[]; readonly samples?: number[]; };
        readonly timeDeltas?: number[];
        readonly lines?: number[];
    }

    export interface ProfileHeader extends ProfileChunk {
        readonly startTime: number;
    }

    export interface ProfileEvent extends SampleEvent {
        readonly name: "Profile";
        readonly args: { readonly data: ProfileHeader; };
    }

    export interface ProfileChunkEvent extends SampleEvent {
        readonly name: "ProfileChunk";
        readonly args: { readonly data: ProfileChunk; };
        readonly id: string | number;
    }

    // Counter events
    export interface CounterEvent extends EventBase {
        readonly ph: Phase.counter;
        readonly name: string;
        /** An optional id that can be combined with the counter name. */
        readonly id?: string | number;
        readonly args: Record<string, number>;
    }

    // Async events
    export type AsyncEvent = AsyncNestableStartEvent | AsyncNestableInstantEvent | AsyncNestableEndEvent;
    export interface AsyncNestableStartEvent extends CorrelatedEventBase {
        readonly ph: Phase.asyncNestableStart;
        readonly args?: object;
    }
    export interface AsyncNestableInstantEvent extends CorrelatedEventBase {
        readonly ph: Phase.asyncNestableInstant;
        readonly args?: object;
    }
    export interface AsyncNestableEndEvent extends CorrelatedEventBase {
        readonly ph: Phase.asyncNestableEnd;
        readonly args?: object;
    }

    // Flow events
    export type FlowEvent = FlowStartEvent | FlowStepEvent | FlowEndEvent;
    export interface FlowStartEvent extends EventBase {
        readonly ph: Phase.flowStart;
        readonly args?: never;
    }
    export interface FlowStepEvent extends EventBase {
        readonly ph: Phase.flowStep;
    }
    export interface FlowEndEvent extends EventBase {
        readonly ph: Phase.flowEnd;
        readonly args?: never;
    }

    // Object events
    export type ObjectEvent = ObjectCreatedEvent | ObjectSnapshotEvent | ObjectDestroyedEvent;
    export interface ObjectCreatedEvent extends CorrelatedEventBase {
        readonly ph: Phase.objectCreated;
        readonly args?: never;
    }
    export interface ObjectSnapshotEvent extends CorrelatedEventBase {
        readonly ph: Phase.objectSnapshot;
        readonly args: { readonly snapshot: any; };
    }
    export interface ObjectDestroyedEvent extends CorrelatedEventBase {
        readonly ph: Phase.objectDestroyed;
        readonly args?: never;
    }

    // Metadata events
    export type MetadataEvent =
        | ProcessNameMetadataEvent
        | ProcessLabelsMetadataEvent
        | ProcessSortIndexMetadataEvent
        | ThreadNameMetadataEvent
        | ThreadSortIndexMetadataEvent
        | OtherMetadataEvent;

    export interface MetadataEventBase extends EventBase {
        readonly ph: Phase.metadata;
    }

    export interface ProcessNameMetadataEvent extends MetadataEventBase {
        readonly name: "process_name";
        readonly args: { readonly name: string; };
    }

    export interface ProcessLabelsMetadataEvent extends MetadataEventBase {
        readonly name: "process_labels";
        readonly args: { readonly labels: unknown; };
    }

    export interface ProcessSortIndexMetadataEvent extends MetadataEventBase {
        readonly name: "process_sort_index";
        readonly args: { readonly sort_index: unknown; };
    }

    export interface ThreadNameMetadataEvent extends MetadataEventBase {
        readonly name: "thread_name";
        readonly args: { readonly name: string; };
    }

    export interface ThreadSortIndexMetadataEvent extends MetadataEventBase {
        readonly name: "thread_sort_index";
        readonly args: { readonly sort_index: unknown; };
    }

    export interface OtherMetadataEvent extends MetadataEventBase {
        readonly name: string;
        readonly args: object;
    }

    // Memory Dump events
    export type MemoryDumpEvent = GlobalMemoryDumpEvent | ProcessMemoryDumpEvent;
    export interface GlobalMemoryDumpEvent extends EventBase {
        readonly ph: Phase.globalMemoryDump;
        readonly args: object; // see: https://docs.google.com/document/d/1ahB_nG7cWWCK4x6mnugsxZ7xdVeM7lRfI7L_HdOZj80/edit#
    }
    export interface ProcessMemoryDumpEvent extends EventBase {
        readonly ph: Phase.processMemoryDump;
        readonly args: object; // see: https://docs.google.com/document/d/1ahB_nG7cWWCK4x6mnugsxZ7xdVeM7lRfI7L_HdOZj80/edit#
    }

    // Mark events
    export interface MarkEvent extends EventBase {
        readonly name: string;
        readonly ph: Phase.mark;
        readonly args?: never;
    }

    // Clock Sync events
    export interface ClockSyncEvent extends EventBase {
        readonly ph: Phase.clockSync;
        readonly args: {
            readonly sync_id: string;
            readonly issue_ts?: number;
        };
    }

    // Context events
    export type ContextEvent = ContextEnterEvent | ContextLeaveEvent;
    export interface ContextEnterEvent extends CorrelatedEventBase {
        readonly ph: Phase.contextEnter;
        readonly args?: never;
    }
    export interface ContextLeaveEvent extends CorrelatedEventBase {
        readonly ph: Phase.contextLeave;
        readonly args?: never;
    }

    // Links
    export interface Link extends EventBase {
        readonly ph: Phase.link;
        readonly args: {
            readonly linked_id: string | number;
        };
    }

    export type Event =
        | DurationEvent
        | EndEvent
        | CompleteEvent
        | InstantEvent
        | SampleEvent
        | CounterEvent
        | AsyncEvent
        | FlowEvent
        | ObjectEvent
        | MetadataEvent
        | MemoryDumpEvent
        | MarkEvent
        | ClockSyncEvent
        | ContextEvent;

    export interface Trace {
        traceEvents: Event[];
        displaytimeUnit?: "ms" | "ns";
        systemTraceEvents?: string;
        powerTraceAsString?: string;
        stackFrames?: StackFrameMap;
        controllerTraceDataKey?: string;
        samples?: Sample[];
        [key: string]: unknown;
    }

    export type StackFrameMap = Record<string | number, StackFrame>;

    export interface StackFrame {
        readonly category: string;
        readonly name: string;
        readonly parent?: string | number;
    }

    export interface Sample {
        readonly cpu?: number;
        readonly tid: number | undefined;
        readonly ts: number;
        readonly name: string;
        readonly sf: string | number;
        readonly weight: number;
    }
}

function toTimestamp(hrtime: number | [number, number]): Runtime.Timestamp {
    return typeof hrtime === "number" ? Math.floor(hrtime) : Profiler.hrtimeToTimestamp(hrtime);
}

function toCategories(categories: Timeline.Categories | readonly Category[]): Timeline.Categories {
    return Array.isArray(categories)
        ? Timeline.joinCategories(categories as readonly Category[]) // https://github.com/microsoft/TypeScript/issues/62238
        : categories as Timeline.Categories;
}

interface LegacyProfile {
    typeId: any;
    uid: any;
    title: string;
    startTime: number;
    endTime: number;
    head: LegacyProfileNode;
    samples?: number[];
    timestamps?: number[];
    events?: LegacyProfileEvents;
}

interface LegacyProfileNode {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
    callUID: number;
    bailoutReason: string;
    deoptReason?: string;
    id: number;
    scriptId?: number;
    hitCount: number;
    children: LegacyProfileNode[];
    lineTicks?: LegacyLineTick[];
}

interface LegacyLineTick {
    line: number;
    hitCount: number;
}

interface LegacyProfileEvents {
    events: LegacyProfileEventNode[];
    samples: number[];
    timestamps: number[];
}

interface LegacyProfileEventNode {
    id: number;
    eventName: string;
    hitCount: number;
}

class LegacyProfileConverter {
    private nodes: Profiler.ProfileNode[] = [];

    static convert(profile: LegacyProfile) {
        return new LegacyProfileConverter().convertProfile(profile);
    }

    private convertProfile(profile: LegacyProfile): Profiler.Profile {
        this.convertNode(profile.head);
        const timeDeltas: number[] = [];
        let lastTimestamp = 0;
        for (const timestamp of profile.timestamps!) {
            timeDeltas.push(timestamp - lastTimestamp);
            lastTimestamp = timestamp;
        }
        return {
            nodes: this.nodes,
            startTime: profile.startTime,
            endTime: profile.endTime,
            samples: profile.samples,
            timeDeltas,
        };
    }

    private convertNode(node: LegacyProfileNode) {
        const id = this.nodes.length;
        this.nodes.push({
            id,
            callFrame: {
                functionName: node.functionName,
                scriptId: node.scriptId + "",
                url: node.url,
                lineNumber: node.lineNumber,
                columnNumber: node.columnNumber,
            },
            hitCount: node.hitCount,
            children: node.children && node.children.map(child => this.convertNode(child)),
            deoptReason: node.deoptReason || node.bailoutReason,
            positionTicks: node.lineTicks && node.lineTicks.map(info => this.convertLineTick(info)),
        });
        return id;
    }

    private convertLineTick(info: LegacyLineTick): Profiler.PositionTickInfo {
        return {
            line: info.line,
            ticks: info.hitCount,
        };
    }
}

import Phase = Timeline.Phase;
import Category = Timeline.Category;
import Scope = Timeline.Scope;
import { Mutable } from "@ts-perf/core";
