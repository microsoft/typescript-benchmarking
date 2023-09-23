import * as fs from "node:fs";

import { Profiler, Session, Timeline } from "@ts-perf/inspector";

import { Executable } from "../executable";

export interface ProfilerOptions {
    args: string[];
    out: string;
    sourceMap: boolean;
    sourceRoot: string;
    timeline: boolean;
    trim: boolean;
    pretty: boolean;
}

export async function profile(options: ProfilerOptions) {
    const session = new Session();
    try {
        const compiler = new Executable(options.args);
        const profiler = new Profiler(session);
        profiler.on("progress", message => {
            console.log(message);
        });

        session.connect();
        if (options.timeline) {
            session.startTimeline();
        }
        await profiler.enable();
        await profiler.start();
        await compiler.exec();
        const profile = await profiler.stop(options);
        await profiler.disable();
        const result = options.timeline ? session.stopTimeline() : profile;
        const content = options.pretty ? JSON.stringify(result, undefined, "  ")
            : result instanceof Timeline ? result.toString() : JSON.stringify(result);
        fs.writeFileSync(options.out, content, { encoding: "utf8" });
    }
    finally {
        session.disconnect();
    }
}
