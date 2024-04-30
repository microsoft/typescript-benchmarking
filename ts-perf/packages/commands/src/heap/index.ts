import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    Command,
    CommandLineArgumentsBuilder,
    CommandMap,
    CompilerOptions,
    ExpansionProvider,
    Host,
    Scenario,
} from "@ts-perf/api";
import { getTempDirectories, HostContext } from "@ts-perf/core";
import * as semver from "semver";

const profiler = require.resolve("@ts-perf/profiler/bin/ts-profiler");

export interface HeapProfilerOptions extends CompilerOptions {
    scenario: string;
    out: string; // The path to the resulting .heapsnapshot file.
    host?: string;
    events?: string[]; // Snapshot event names.
}

export async function heap(options: HeapProfilerOptions, host: HostContext) {
    const tempDirs = await getTempDirectories();
    const scenario = await Scenario.findScenario(options.scenarioDirs, options.scenario, /*kind*/ "tsc");
    const testHost = options.host
        ? await Host.findHost(options.host, { onlyHosts: ["node"] })
        : Host.current;

    if (!scenario) {
        host.error(`abort: Compiler scenario not found.`);
        return;
    }

    if (!testHost) {
        host.error(`abort: Test host not found.`);
        return;
    }

    if (semver.lt(testHost.version!, "8.0.0", true)) {
        host.error(`abort: 'heap' is not supported on node versions prior to 8.0.0`);
        return;
    }

    const scenarioName = scenario.name;
    const name = `${scenarioName} - ${testHost.name}`;
    const localExpansion = ExpansionProvider.getProviders({
        runner: { kind: "tsc", options },
        temp: tempDirs,
        scenario,
        host: testHost,
    });
    const builder = new CommandLineArgumentsBuilder(localExpansion, testHost)
        .add(profiler, "heap");

    const heapsnapshot = path.resolve(localExpansion.expand(options.out));

    builder.add("--out", heapsnapshot);
    try {
        await fs.promises.mkdir(path.dirname(heapsnapshot));
    }
    catch (e) {}
    try {
        await fs.promises.unlink(heapsnapshot);
    }
    catch (e) {}

    if (options.events) {
        const extname = path.extname(heapsnapshot);
        const basename = path.basename(heapsnapshot, extname);
        const dirname = path.dirname(heapsnapshot);
        for (const event of options.events) {
            const file = path.join(
                dirname,
                extname
                    ? basename + "." + event + extname
                    : basename + "." + event + ".heapsnapshot",
            );
            try {
                await fs.promises.unlink(file);
            }
            catch (e) {}
            builder.add("--event", event);
        }
    }

    const tsc = path.join(options.builtDir, "tsc.js");
    builder
        .add("--", path.resolve(tsc))
        .addCompilerOptions(options, scenario)
        .add("--diagnostics");

    host.log(
        `Heap profiling ${name}${
            options.host ? ` on ${testHost.name} (${testHost.version}, ${testHost.arch})` : ``
        }...`,
    );

    await new Promise((resolve, reject) => {
        host.trace(`> ${builder}`);
        const start = Date.now();
        const proc = spawn(builder.cmd!, builder.args, { stdio: "pipe" });
        proc.stdout.on("data", data => host.outputStream!.write(data));
        proc.stderr.on("data", data => host.outputStream!.write(data));
        proc.on("error", e => done(e));
        proc.on("exit", () => done());
        function done(error?: any) {
            const end = Date.now();
            host.log(`Profiling took ${end - start} ms.`);
            if (error) {
                reject(error);
            }
            else {
                resolve(error);
            }
        }
    });
}

const command: Command<HeapProfilerOptions> = {
    commandName: "heap",
    summary: "Generate heap snapshots of the compiler.",
    description: "Generate heap snapshots during compiler execution.",
    include: ["compiler", "heapsnapshot", "common"],
    options: {
        scenario: {
            type: "string",
            param: "scenario",
            description: "Profile the named compiler <scenario>.",
            position: 0,
            required: true,
        },
        out: {
            type: "string",
            param: "file",
            description: "Saves a heap snapshot to <file>.",
            position: 1,
            required: true,
        },
        events: {
            type: "string",
            longName: "event",
            multiple: true,
            param: "event",
            description: "Takes a heap snapshot at the specified <event> (can be specified multiple times).",
        },
        host: {
            type: "string",
            param: "host",
            description: "Profile using the specified <host>.",
        },
        force: {
            type: "boolean",
            shortName: "F",
            description: "If the remote performance service is locked, forcibly overwrite the lock (requires --ssh).",
        },
    },
    lock: true,
    update: true,
    exec: ({ options }, host) => heap(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.heap = command;
}
