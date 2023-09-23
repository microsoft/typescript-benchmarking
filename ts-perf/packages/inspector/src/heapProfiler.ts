import { WriteStream } from "node:fs";
import { Writable } from "node:stream";

import { Deferred } from "@esfx/async-deferred";
import { StrictEventEmitter } from "@ts-perf/events";

import * as inspector from "./inspector";
import { Runtime } from "./runtime";
import { Session } from "./session";

export interface HeapProfilerEvents {
    addHeapSnapshotChunk: (param: HeapProfiler.AddHeapSnapshotChunkEventDataType) => void;
    resetProfiles: () => void;
    // NOTE: currently broken in NodeJS
    // reportHeapSnapshotProgress: (param: HeapProfiler.ReportHeapSnapshotProgressEventDataType) => void;
    /**
     * If heap objects tracking has been started then backend regularly sends a current value for last seen object id and corresponding timestamp. If the were changes in the heap since last event then one or more heapStatsUpdate events will be sent before a new lastSeenObjectId event.
     */
    lastSeenObjectId: (param: HeapProfiler.LastSeenObjectIdEventDataType) => void;
    /**
     * If heap objects tracking has been started then backend may send update for one or more fragments
     */
    heapStatsUpdate: (param: HeapProfiler.HeapStatsUpdateEventDataType) => void;
}

/**
 * @experimental
 */
export class HeapProfiler extends StrictEventEmitter<HeapProfilerEvents> {
    public readonly session: Session;

    private _takingSnapshot = false;
    private _started = false;
    private _snapshotReportProgress: boolean | undefined;
    private _snapshotWritable: Writable | undefined;
    private _snapshotDeferred: Deferred<void> | undefined;

    constructor(session: Session) {
        super();
        this.session = session;
        this.session.on("HeapProfiler.addHeapSnapshotChunk", message => {
            this.onAddHeapSnapshotChunk(message.params);
        });
        this.session.on("HeapProfiler.resetProfiles", () => this.emit("resetProfiles"));
        // this.session.on("HeapProfiler.reportHeapSnapshotProgress", message => { this.onReportHeapSnapshotProgress(message.params); });
        this.session.on("HeapProfiler.lastSeenObjectId", message => this.emit("lastSeenObjectId", message.params));
        this.session.on("HeapProfiler.heapStatsUpdate", message => this.emit("heapStatsUpdate", message.params));
    }

    public enable() {
        return this.session.postAsync("HeapProfiler.enable");
    }

    public disable() {
        return this.session.postAsync("HeapProfiler.disable");
    }

    public startTrackingHeapObjects(options: { trackAllocations?: boolean; } = {}) {
        this._started = true;
        return this.session.postAsync("HeapProfiler.startTrackingHeapObjects", { ...options });
    }

    public async stopTrackingHeapObjects(options?: { reportProgress?: boolean; end?: boolean; }): Promise<void>;
    public async stopTrackingHeapObjects(
        writable: Writable,
        options?: { reportProgress?: boolean; end?: boolean; },
    ): Promise<void>;
    public async stopTrackingHeapObjects(
        writable?: Writable | typeof options,
        options: { reportProgress?: boolean; end?: boolean; } = {},
    ) {
        if (!this._started) throw new Error("Heap object tracking is not started.");
        this._started = false;

        if (this._takingSnapshot) {
            await this._snapshotDeferred!.promise;
        }

        if (writable instanceof Writable) {
            return await this.takeSnapshotVia(
                writable,
                options,
                () => this.session.postAsync("HeapProfiler.takeHeapSnapshot", { reportProgress: true }),
            );
        }

        try {
            this._snapshotReportProgress = (writable || options).reportProgress;
            return await this.session.postAsync("HeapProfiler.stopTrackingHeapObjects", {
                reportProgress: this._snapshotReportProgress,
            });
        }
        finally {
            this._snapshotReportProgress = false;
        }
    }

    public async takeHeapSnapshot(writable: Writable, options: { end?: boolean; } = {}) {
        if (!this._started) throw new Error("Heap object tracking is not started.");
        return await this.takeSnapshotVia(
            writable,
            options,
            () => this.session.postAsync("HeapProfiler.takeHeapSnapshot"),
        );
    }

    private async takeSnapshotVia(writable: Writable, options: { end?: boolean; }, action: () => Promise<void>) {
        if (this._takingSnapshot) return;
        this._snapshotWritable = writable;
        this._snapshotReportProgress = false;
        this._snapshotDeferred = new Deferred<void>();
        this._takingSnapshot = true;
        await action();
        if (options.end) {
            if (writable instanceof WriteStream) {
                writable.close();
            }
            else {
                writable.end();
            }
        }
        const snapshotDeferred = this._snapshotDeferred!;
        this._snapshotWritable = undefined;
        this._snapshotReportProgress = false;
        this._snapshotDeferred = undefined;
        this._takingSnapshot = false;
        snapshotDeferred.resolve();
    }

    private onAddHeapSnapshotChunk(params: HeapProfiler.AddHeapSnapshotChunkEventDataType) {
        if (this._takingSnapshot) {
            this._snapshotWritable!.write(params.chunk, "utf8");
        }
        this.emit("addHeapSnapshotChunk", params);
    }

    // private onReportHeapSnapshotProgress(params: HeapProfiler.ReportHeapSnapshotProgressEventDataType) {
    //     if (this._snapshotReportProgress) {
    //         this.emit("reportHeapSnapshotProgress", params);
    //     }
    // }

    public collectGarbage() {
        return this.session.postAsync("HeapProfiler.collectGarbage");
    }

    public async getObjectByHeapObjectId(
        objectId: HeapProfiler.HeapSnapshotObjectId,
        options: HeapProfiler.GetObjectByHeapObjectIdOptions = {},
    ) {
        return (await this.session.postAsync("HeapProfiler.getObjectByHeapObjectId", { objectId, ...options })).result;
    }

    /**
     * Enables console to refer to the node with given id via $x (see Command Line API for more
     * details $x functions).
     */
    public addInspectedHeapObject(heapObjectId: HeapProfiler.HeapSnapshotObjectId) {
        return this.session.postAsync("HeapProfiler.addInspectedHeapObject", { heapObjectId });
    }

    public async getHeapObjectId(objectId: Runtime.RemoteObjectId) {
        return (await this.session.postAsync("HeapProfiler.getHeapObjectId", { objectId })).heapSnapshotObjectId;
    }

    public startSampling(samplingInterval?: number) {
        return this.session.postAsync("HeapProfiler.startSampling", { samplingInterval });
    }

    public async stopSampling() {
        return (await this.session.postAsync("HeapProfiler.stopSampling")).profile;
    }
}

export namespace HeapProfiler {
    export import HeapSnapshotObjectId = inspector.HeapProfiler.HeapSnapshotObjectId;
    export import SamplingHeapProfileNode = inspector.HeapProfiler.SamplingHeapProfileNode;
    export import SamplingHeapProfile = inspector.HeapProfiler.SamplingHeapProfile;
    export import GetObjectByHeapObjectIdReturnType = inspector.HeapProfiler.GetObjectByHeapObjectIdReturnType;
    export import GetHeapObjectIdReturnType = inspector.HeapProfiler.GetHeapObjectIdReturnType;
    export import StopSamplingReturnType = inspector.HeapProfiler.StopSamplingReturnType;
    export import AddHeapSnapshotChunkEventDataType = inspector.HeapProfiler.AddHeapSnapshotChunkEventDataType;
    export import ReportHeapSnapshotProgressEventDataType = inspector.HeapProfiler.ReportHeapSnapshotProgressEventDataType;
    export import LastSeenObjectIdEventDataType = inspector.HeapProfiler.LastSeenObjectIdEventDataType;
    export import HeapStatsUpdateEventDataType = inspector.HeapProfiler.HeapStatsUpdateEventDataType;

    export type GetObjectByHeapObjectIdOptions = Pick<
        inspector.HeapProfiler.GetObjectByHeapObjectIdParameterType,
        "objectGroup"
    >;
}

export import HeapSnapshotObjectId = inspector.HeapProfiler.HeapSnapshotObjectId;
export import SamplingHeapProfileNode = inspector.HeapProfiler.SamplingHeapProfileNode;
export import SamplingHeapProfile = inspector.HeapProfiler.SamplingHeapProfile;
