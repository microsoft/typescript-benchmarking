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

export async function profile(options: ProfilerOptions, host: HostContext) {
    const tempDirs = await getTempDirectories();
    const scenario = await Scenario.findScenario(options.scenario, { scenarioDir: options.scenarioDir, kind: "tsc" });
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
        host.error(`abort: 'profile' no longer supported on node versions prior to 8.0.0`);
        return;
    }

    const scenarioName = scenario.name;
    const localExpansion = ExpansionProvider.getProviders({
        runner: { kind: "tsc", options },
        temp: tempDirs,
        scenario,
        host: testHost,
    });
    const builder = new CommandLineArgumentsBuilder(localExpansion, testHost)
        .add(profiler, "profile");

    const cpuprofile = path.resolve(localExpansion.expand(options.out));

    try {
        await fs.promises.mkdir(path.dirname(cpuprofile));
    }
    catch {}
    try {
        await fs.promises.unlink(cpuprofile);
    }
    catch {}

    builder
        .add("--out", cpuprofile)
        .addSwitch("--sourceMap", options.sourcemap)
        .addOptional("--sourceRoot", options.sourceroot)
        .addSwitch("--timeline", options.timeline)
        .addSwitch("--trim", options.trim)
        .addSwitch("--pretty", options.pretty);

    const tsc = path.join(options.builtDir, "tsc.js");
    builder
        .add("--", path.resolve(tsc))
        .addCompilerOptions(options, scenario)
        .add("--diagnostics");

    host.log(
        `Profiling ${scenarioName}${
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

export interface ProfilerOptions extends CompilerOptions {
    scenario: string;
    out: string; // The path to the resulting .cpuprofile file.
    host?: string;
    sourcemap: boolean;
    sourceroot?: string;
    timeline: boolean;
    trim: boolean;
    pretty: boolean;
}

const command: Command<ProfilerOptions> = {
    commandName: "profile",
    summary: "Profile the compiler.",
    description: "Profile the compiler using CPU sampling and the installed version of NodeJS.",
    include: ["compiler", "common"],
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
            description: "Saves the CPU profile output to <file>.",
            position: 1,
            required: true,
        },
        host: {
            type: "string",
            param: "host",
            description: "Profile using the specified <host>.",
        },
        sourcemap: {
            type: "boolean",
            description: "Determines whether to apply source maps to source locations in the CPU profile.",
            defaultValue: true,
        },
        sourceroot: {
            type: "string",
            description: "The source root to use for source maps",
        },
        timeline: {
            type: "boolean",
            description: "Determines whether to wrap the profile in a profiler timeline.",
            defaultValue: true,
        },
        trim: {
            type: "boolean",
            description: "Trim natives, node internals, profiler, external, and extraneous code.",
            defaultValue: false,
        },
        pretty: {
            type: "boolean",
            description: "Add indenting and whitespace to the output file.",
            defaultValue: false,
            visibility: "advanced",
        },
        force: {
            type: "boolean",
            shortName: "F",
            description: "If the remote performance service is locked, forcibly overwrite the lock (requires --ssh).",
        },
    },
    lock: true,
    update: true,
    exec: ({ options }, host) => profile(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.profile = command;
}
