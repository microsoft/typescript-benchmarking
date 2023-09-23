import * as fs from "node:fs";
import * as path from "node:path";

import { HeapProfiler, Runtime, Session } from "@ts-perf/inspector";

import { Executable } from "../executable";

export interface HeapOptions {
    args: string[];
    out: string;
    events: string[];
}

export async function heapProfile(options: HeapOptions) {
    const events = new Set<string>(options.events);
    const pendingActions: Promise<void>[] = [];
    let tracking = false;
    let takingSnapshot = false;

    // setup profiler
    const session = new Session();
    const compiler = new Executable(options.args);
    const heapProfiler = new HeapProfiler(session);
    const runtime = new Runtime(session);

    session.connect();
    await runtime.addBinding("onProfilerEvent");
    await heapProfiler.enable();

    runtime.on("bindingCalled", ({ name, payload }) => {
        if (name === "onProfilerEvent" && tracking && !takingSnapshot && events.has(payload)) {
            takingSnapshot = true;
            pendingActions.push(takeSnapshot(payload));
        }
    });

    await heapProfiler.startTrackingHeapObjects();

    tracking = true;
    await compiler.exec();
    tracking = false;

    pendingActions.push(
        options.events
            ? heapProfiler.stopTrackingHeapObjects()
            : heapProfiler.stopTrackingHeapObjects(fs.createWriteStream(getSnapshotName(), "utf8"), { end: true }),
    );

    await Promise.all(pendingActions);

    // tear down profiler
    await heapProfiler.disable();
    session.disconnect();

    function getSnapshotName(eventName?: string) {
        const extname = path.extname(options.out);
        if (eventName) {
            const basename = path.basename(options.out, extname);
            const dirname = path.dirname(options.out);
            return path.join(
                dirname,
                extname
                    ? basename + "." + eventName + extname
                    : basename + "." + eventName + ".heapsnapshot",
            );
        }
        else {
            return extname
                ? options.out
                : options.out + ".heapsnapshot";
        }
    }

    async function takeSnapshot(eventName: string) {
        takingSnapshot = true;
        await heapProfiler.takeHeapSnapshot(fs.createWriteStream(getSnapshotName(eventName), "utf8"), { end: true });
        takingSnapshot = false;
    }
}
