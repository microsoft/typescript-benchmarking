import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import esMain from "es-main";

import { setupPipeline } from "./setupPipeline.js";

// Train on the compiler scenarios that "perf test this faster" benchmarks.
export async function getPgoScenarios() {
    const { matrix } = await setupPipeline({
        input: "tsc-only",
        baselining: false,
        isPr: false,
        implementation: "corsa",
        shouldLog: false,
        gitParseRev: () => Promise.reject(new Error("Unexpected commit range")),
    });
    return Object.values(matrix.any).map(job => job.TSPERF_JOB_SCENARIO).sort();
}

export function getCompilerArgs(root: string, scenario: string, output: string, profile: string) {
    const config: { kind: string; args: string[]; } = JSON.parse(
        fs.readFileSync(path.join(root, "cases/scenarios", scenario, "scenario.json"), "utf8"),
    );
    assert.equal(config.kind, "tsc");
    const args = config.args.map(arg =>
        arg.replaceAll("${suiteDirectory}", path.join(root, "cases/solutions"))
            .replaceAll("${outDirectory}", output)
    );
    if (args[0] === "-b") {
        args.push("--force");
    }
    else {
        args.push(
            "--noEmit",
            "false",
            "--noEmitOnError",
            "false",
            "--incremental",
            "false",
            "--composite",
            "false",
            "--outDir",
            output,
            "--rootDir",
            path.join(root, "cases/solutions", scenario),
            "--rewriteRelativeImportExtensions",
        );
        if (scenario === "tanstack-router") args.push("--declaration", "false");
    }
    args.push("--diagnostics", "false", "--extendedDiagnostics", "false", "--pretty", "false", "--pprofDir", profile);
    return args;
}

export function profileScenario(root: string, scenario: string, binary: string, profile: string, output: string) {
    fs.chmodSync(binary, 0o755); // Artifact downloads do not preserve executable permissions.
    fs.mkdirSync(profile, { recursive: true });
    const args = getCompilerArgs(root, scenario, output, profile);
    const cwd = path.join(root, "cases/solutions", scenario);
    if (args[0] === "-b") {
        execFileSync(binary, ["-b", args[1], "--clean"], { cwd, stdio: "inherit" });
    }
    const result = spawnSync(binary, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (result.error) throw result.error;
    const text = result.stdout + result.stderr;
    fs.writeFileSync(path.join(profile, "compiler.log"), text);
    const errors = text.match(/error TS\d+:/g)?.length ?? 0;
    const ok = result.signal === null && !/^(?:panic:|fatal error:)/m.test(text)
        && (result.status === 0 || ((result.status === 1 || result.status === 2) && errors > 0));
    // Many benchmarks have known type errors; only show the output when the compiler itself fails.
    if (!ok) process.stdout.write(text);
    assert(ok, `Compiler failed (exit ${result.status}, signal ${result.signal})`);
    if (errors > 0) console.warn(`Retaining profile from compilation with ${errors} TypeScript errors.`);
    assert.equal(
        fs.readdirSync(profile).filter(file => file.endsWith("-cpuprofile.pb.gz")).length,
        1,
        "Expected one CPU profile",
    );
}

if (esMain(import.meta)) {
    if (process.argv[2] === "matrix") {
        console.log(JSON.stringify({ scenario: await getPgoScenarios() }));
        process.exit();
    }
    const [scenario, binary, profile, output] = process.argv.slice(2);
    assert(scenario && binary && profile && output, "Usage: generatePgo <scenario> <compiler> <profiles> <emit>");
    profileScenario(process.cwd(), scenario, path.resolve(binary), path.resolve(profile), path.resolve(output));
}
