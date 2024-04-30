import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
    Command,
    CommandLineArgumentsBuilder,
    CommandMap,
    CommonOptions,
    CompilerOptions,
    ExpansionProvider,
    ExpansionProviderSet,
    Host,
    Scenario,
} from "@ts-perf/api";
import { getTempDirectories, HostContext } from "@ts-perf/core";
import * as semver from "semver";

export interface TraceOptions extends CompilerOptions, CommonOptions {
    scenario: string;
    outDir?: string;
    host?: string;
    deoptExplorer?: boolean;
    out?: string;
}

export async function trace(options: TraceOptions, host: HostContext) {
    const scenario = await Scenario.findScenario(options.scenarioDirs, options.scenario, /*kind*/ "tsc");

    if (!scenario) {
        host.error(`abort: Compiler scenario not found.`);
        return;
    }

    const testHost = options.host
        ? await Host.findHost(options.host, { onlyHosts: ["node"] })
        : Host.current;

    if (!testHost) {
        host.error(`abort: Test host not found.`);
        return;
    }

    const tempDirs = await getTempDirectories();
    const localExpansion = ExpansionProvider.getProviders({
        runner: { kind: "tsc", options },
        temp: tempDirs,
        scenario,
        host: testHost,
    });

    if (testHost.version && semver.lt(testHost.version, "9.0.0")) {
        if (options.deoptExplorer) {
            host.error("--deoptExplorer not supported for node versions prior to 9.0.0");
            return;
        }
        await traceHydrogen(testHost, scenario, localExpansion, options, host);
    }
    else {
        if (options.deoptExplorer) {
            await traceDeoptExplorer(testHost, scenario, localExpansion, options, host);
        }
        else {
            await traceTurbofan(testHost, scenario, localExpansion, options, host);
        }
    }
}

async function traceHydrogen(
    testHost: Host,
    scenario: Scenario,
    localExpansion: ExpansionProviderSet,
    options: TraceOptions,
    host: HostContext,
) {
    const scenarioName = scenario.name;
    const name = `${scenarioName} - ${testHost!.name}`;

    const outDir = path.resolve(localExpansion.expand(options.outDir || "."));
    const hydrogen = path.posix.join(outDir, "hydrogen.cfg");
    const code = path.posix.join(outDir, "code.asm");

    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });

    const tsc = path.join(options.builtDir, "tsc.js");
    const { cmd, args } = new CommandLineArgumentsBuilder(localExpansion, testHost)
        .add("--trace-hydrogen")
        .add(`--trace-hydrogen-file=${hydrogen}`)
        .add("--trace-phase=Z")
        .add("--trace-deopt")
        .add("--code-comments")
        .add("--hydrogen-track-positions")
        .add("--redirect-code-traces")
        .add(`--redirect-code-traces-to=${code}`)
        .add(tsc)
        .addCompilerOptions(options, scenario);

    host.log(`Tracing Hydrogen IR deoptimizations for '${name}' (this may take awhile)...`);
    host.trace(`> ${cmd} ${args.join(" ")}`);

    const p = spawn(cmd!, args);
    await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            p.removeListener("exit", onexit);
            p.removeListener("error", onerror);
        };
        const onexit = () => {
            resolve();
            cleanup();
        };
        const onerror = (err: any) => {
            reject(err);
            cleanup();
        };
        p.once("exit", onexit);
        p.once("error", onerror);
    });
}

async function traceTurbofan(
    testHost: Host,
    scenario: Scenario,
    localExpansion: ExpansionProviderSet,
    options: TraceOptions,
    host: HostContext,
) {
    const scenarioName = scenario.name;
    const name = `${scenarioName} - ${testHost!.name}`;

    const outDir = path.resolve(localExpansion.expand(options.outDir || "."));

    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });

    const cwd = process.cwd();
    try {
        process.chdir(outDir);

        const tsc = path.join(options.builtDir, "tsc.js");
        const { cmd, args } = new CommandLineArgumentsBuilder(localExpansion, testHost, /*exposeGc*/ false)
            .add(`--no-concurrent-recompilation`)
            .add(`--trace-turbo`)
            .add(`--trace-deopt`)
            .add("--code-comments")
            .add("--redirect-code-traces")
            .add("--redirect-code-traces-to=code.asm")
            .add("--print-all-code")
            .add(tsc)
            .addCompilerOptions(options, scenario);

        host.log(`Tracing TurboFan IR deoptimizations for '${name}' (this may take awhile)...`);
        host.trace(`> ${cmd} ${args.join(" ")}`);

        await new Promise<void>((resolve, reject) => {
            const child = spawn(cmd!, args, { stdio: [0, 1, 2] });
            const onChildExit = () => {
                resolve();
                cleanup();
            };
            const onChildError = (err: any) => {
                reject(err);
                cleanup();
            };
            const onProcessExit = () => {
                child.kill("SIGHUP");
            };
            const cleanup = () => {
                child.removeListener("exit", onChildExit);
                child.removeListener("error", onChildError);
                process.removeListener("exit", onProcessExit);
            };
            process.on("exit", onProcessExit);
            child.once("exit", onChildExit);
            child.once("error", onChildError);
        });
    }
    finally {
        process.chdir(cwd);
    }

    // fix sourceName
    if (process.platform === "win32") {
        host.log("Fixing 'sourceName' paths in json files...");
        let names = await fs.promises.readdir(outDir);
        names = names.filter(name => path.extname(name) === ".json");
        for (const name of names) {
            const source = await fs.promises.readFile(path.join(outDir, name), "utf8");
            const updated = source.replace(
                sourceNameRegExp,
                (_, sourceName) => `"sourceName": ${JSON.stringify(sourceName)}`,
            );
            if (updated !== source) {
                await fs.promises.writeFile(path.join(outDir, name), updated, "utf8");
            }
        }
    }
}

async function traceDeoptExplorer(
    testHost: Host,
    scenario: Scenario,
    localExpansion: ExpansionProviderSet,
    options: TraceOptions,
    host: HostContext,
) {
    const scenarioName = scenario.name;
    const name = `${scenarioName} - ${testHost!.name}`;

    const outFile = path.resolve(localExpansion.expand(options.out || "./v8.log"));

    const outDir = path.dirname(outFile);
    await fs.promises.mkdir(outDir, { recursive: true });

    const cwd = process.cwd();
    try {
        process.chdir(outDir);

        const tsc = path.join(options.builtDir, "tsc.js");
        const { cmd, args } = new CommandLineArgumentsBuilder(localExpansion, testHost, /*exposeGc*/ false)
            .add(`--trace-ic`)
            .add(`--trace-maps`)
            .add(`--prof`)
            .add(`--log-internal-timer-events`)
            .add(`--no-logfile-per-isolate`)
            .add(`--logfile=${path.basename(outFile)}`)
            .add(tsc)
            .addCompilerOptions(options, scenario);

        host.log(`Tracing deoptimizations for '${name}' (this may take awhile)...`);
        host.trace(`> ${cmd} ${args.join(" ")}`);

        await new Promise<void>((resolve, reject) => {
            const child = spawn(cmd!, args, { stdio: [0, 1, 2] });
            const onChildExit = () => {
                resolve();
                cleanup();
            };
            const onChildError = (err: any) => {
                reject(err);
                cleanup();
            };
            const onProcessExit = () => {
                child.kill("SIGHUP");
            };
            const cleanup = () => {
                child.removeListener("exit", onChildExit);
                child.removeListener("error", onChildError);
                process.removeListener("exit", onProcessExit);
            };
            process.on("exit", onProcessExit);
            child.once("exit", onChildExit);
            child.once("error", onChildError);
        });
    }
    finally {
        process.chdir(cwd);
    }
}

const sourceNameRegExp = /"sourceName": "([^"]+)"/g;

const command: Command<TraceOptions> = {
    commandName: "trace",
    summary: "Trace deoptimizations in NodeJS (v8).",
    description: "Trace deoptimizations in NodeJS (v8).",
    include: ["compiler", "remote", "common"],
    options: {
        outDir: {
            type: "string",
            param: "folder",
            description: "Saves the trace output to <folder>.",
            group: "outDir",
        },
        out: {
            type: "string",
            param: "file",
            description: "Saves the trace output to <file>.",
            group: "deoptExplorer",
        },
        scenario: {
            type: "string",
            param: "scenario",
            description: "Run only the named <scenario>.",
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
        deoptExplorer: {
            type: "boolean",
            shortName: "D",
            description: "Generate trace outputs useful to deoptexplorer-vscode",
            group: "deoptExplorer",
        },
    },
    lock: true,
    update: true,
    exec: ({ options }, host) => trace(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.trace = command;
}
