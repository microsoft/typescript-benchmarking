import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import esMain from "es-main";

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
    process.stdout.write(text);
    assert(
        result.signal === null && !/^(?:panic:|fatal error:)/m.test(text)
            && (result.status === 0 || ((result.status === 1 || result.status === 2) && /error TS\d+:/.test(text))),
        `Compiler failed (exit ${result.status}, signal ${result.signal})`,
    );
    if (result.status !== 0) console.warn("Retaining profile from compilation with TypeScript diagnostics.");
    assert.equal(
        fs.readdirSync(profile).filter(file => file.endsWith("-cpuprofile.pb.gz")).length,
        1,
        "Expected one CPU profile",
    );
}

if (esMain(import.meta)) {
    const [scenario, binary, profile, output] = process.argv.slice(2);
    assert(scenario && binary && profile && output, "Usage: generatePgo <scenario> <compiler> <profiles> <emit>");
    profileScenario(process.cwd(), scenario, path.resolve(binary), path.resolve(profile), path.resolve(output));
}
