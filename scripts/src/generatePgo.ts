import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import esMain from "es-main";

export const trainingScenarios = [
    "vscode",
    "sentry",
    "social-app",
    "t3code-server",
    "mui-docs",
    "arktype",
    "webpack",
    "xstate-main",
    "strada-build-src",
    "effect",
    "tanstack-router",
    "class-transformer",
] as const;

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const writeJson = (file: string, value: unknown) =>
    fs.writeFileSync(file, JSON.stringify(value, undefined, 4) + "\n", { flag: "wx" });

interface Workload {
    name: string;
    args: string[];
    build?: string;
    emittedDirectory: string;
}

export function getWorkloads(root: string, scenario: string, output: string): Workload[] {
    assert(trainingScenarios.some(name => name === scenario), `Unknown training scenario: ${scenario}`);
    const config: { kind: string; args: string[]; } = JSON.parse(
        fs.readFileSync(path.join(root, "cases/scenarios", scenario, "scenario.json"), "utf8"),
    );
    assert.equal(config.kind, "tsc");
    const suite = path.join(root, "cases/solutions");
    const solution = path.join(suite, scenario);
    const args = config.args.map(arg =>
        arg.replaceAll("${suiteDirectory}", suite).replaceAll("${outDirectory}", output)
    );
    assert(args.every(arg => !arg.includes("${")), "Unexpanded scenario variable");
    const common = ["--diagnostics", "false", "--extendedDiagnostics", "false", "--pretty", "false"];
    if (args[0] === "-b") {
        assert.equal(args.length, 2, "Expected one build-mode entry point");
        return [{
            name: scenario,
            args: [...args, "--force", ...common],
            build: args[1],
            emittedDirectory: path.join(
                solution,
                scenario === "effect" ? "packages/effect/dist" : "built/local",
            ),
        }];
    }
    const emit = [
        "--noEmit",
        "false",
        "--noEmitOnError",
        "false",
        "--incremental",
        "false",
        "--outDir",
        output,
        "--rootDir",
        solution,
        "--rewriteRelativeImportExtensions",
        ...common,
    ];
    return [{
        name: scenario,
        args: [...args, ...emit, ...(scenario === "tanstack-router" ? ["--declaration", "false"] : [])],
        emittedDirectory: output,
    }];
}

export function buildSeed(root: string, compiler: string, output: string, ref: string) {
    fs.mkdirSync(output, { recursive: true });
    const module = path.join(compiler, "tsc");
    execFileSync("go", ["build", "-pgo=off", "-tags=noembed", "-o", path.join(output, "tsc"), "./cmd/tsc"], {
        cwd: module,
        env: { ...process.env, CGO_ENABLED: "0" },
        stdio: "inherit",
    });
    const libs = path.join(module, "internal/bundled/libs");
    for (const file of fs.readdirSync(libs).filter(file => file.endsWith(".d.ts"))) {
        fs.copyFileSync(path.join(libs, file), path.join(output, file));
    }
    const goVersion = execFileSync("go", ["env", "GOVERSION"], { encoding: "utf8" }).trim();
    writeJson(path.join(output, "seed.json"), {
        repository: "microsoft/TypeScript",
        ref,
        commit: git(compiler, "rev-parse", "HEAD"),
        benchmarkCommit: git(root, "rev-parse", "HEAD"),
        goVersion,
        platform: `${process.platform}/${process.arch}`,
        sha256: hash(fs.readFileSync(path.join(output, "tsc"))),
        build: execFileSync("go", ["version", "-m", path.join(output, "tsc")], { encoding: "utf8" }),
    });
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `go-version=${goVersion.replace(/^go/, "")}\n`);
    }
}

function emittedDigest(directory: string) {
    const files = fs.readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter(entry => entry.isFile() && !entry.name.endsWith(".tsbuildinfo"))
        .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)))
        .sort();
    assert(files.length > 0, "Compilation emitted no files");
    const digest = createHash("sha256");
    for (const file of files) {
        digest.update(file + "\0");
        digest.update(fs.readFileSync(path.join(directory, file)));
    }
    return { files: files.length, sha256: digest.digest("hex") };
}

export function checkCompilation(status: number | null, signal: string | null, output: string) {
    assert.equal(signal, null, `Compiler terminated by ${signal}`);
    assert(!/^(?:panic:|fatal error:)/m.test(output), `Compiler crashed:\n${output}`);
    const diagnostics = output.split("\n").filter(line => /error TS\d+:/.test(line)).sort();
    assert(
        status === 0 || ((status === 1 || status === 2) && diagnostics.length > 0),
        `Compiler failed (exit ${status}):\n${output}`,
    );
    assert.equal(status === 0, diagnostics.length === 0, "Unexpected compiler diagnostic exit status");
    assert(
        !/^Memory (?:allocs|used):|^(?:Aggregate )?(?:Check|Total) time:/mi.test(output),
        "Diagnostic reporting was unexpectedly enabled",
    );
    return { count: diagnostics.length, sha256: hash(diagnostics.join("\n")) };
}

export function collectProfiles(root: string, scenario: string, seed: string, output: string) {
    const binary = path.join(seed, "tsc");
    fs.chmodSync(binary, 0o755); // Artifact downloads do not preserve executable permissions.
    const seedInfo = JSON.parse(fs.readFileSync(path.join(seed, "seed.json"), "utf8"));
    assert.equal(hash(fs.readFileSync(binary)), seedInfo.sha256, "Seed compiler checksum mismatch");
    fs.mkdirSync(output, { recursive: true });
    const solution = path.join(root, "cases/solutions", scenario);
    const scratch = path.join(output, "emit");
    const workloads = getWorkloads(root, scenario, scratch);
    for (const workload of workloads) {
        const directory = path.join(output, workload.name);
        fs.mkdirSync(directory);
        const profileDir = path.join(directory, "profiles");
        fs.mkdirSync(profileDir);
        function compile(profile: boolean) {
            if (workload.build) {
                execFileSync(binary, ["-b", workload.build, "--clean"], { cwd: solution, stdio: "inherit" });
            }
            else {
                fs.mkdirSync(scratch);
            }
            const args = [...workload.args, ...(profile ? ["--pprofDir", profileDir] : [])];
            const result = spawnSync(binary, args, {
                cwd: solution,
                encoding: "utf8",
                maxBuffer: 64 * 1024 * 1024,
            });
            if (result.error) throw result.error;
            const text = result.stdout + result.stderr;
            fs.writeFileSync(path.join(directory, profile ? "profile.log" : "preflight.log"), text);
            const diagnostics = checkCompilation(result.status, result.signal, text);
            const emitted = emittedDigest(workload.emittedDirectory);
            if (!workload.build) fs.rmSync(scratch, { recursive: true });
            return { status: result.status, diagnostics, emitted };
        }
        const preflight = compile(false);
        if (preflight.diagnostics.count) {
            console.warn(`${workload.name}: retaining ${preflight.diagnostics.count} diagnostics; see preflight.log`);
        }
        const profiled = compile(true);
        assert.deepEqual(profiled, preflight, "Profiling changed diagnostics or emitted output");
        const profiles = fs.readdirSync(profileDir).filter(file => file.endsWith("-cpuprofile.pb.gz"));
        assert.equal(profiles.length, 1, "Expected exactly one CPU profile");
        const cpu = path.join(profileDir, profiles[0]);
        assert(fs.statSync(cpu).size > 0, "Empty CPU profile");
        writeJson(path.join(directory, "manifest.json"), {
            name: workload.name,
            scenario,
            seed: seedInfo,
            repository: git(solution, "remote", "get-url", "origin"),
            revision: git(solution, "rev-parse", "HEAD"),
            patch: git(solution, "diff", "HEAD"),
            scenarioConfig: JSON.parse(
                fs.readFileSync(path.join(root, "cases/scenarios", scenario, "scenario.json"), "utf8"),
            ),
            benchmarkConfig: scenario === "class-transformer"
                ? fs.readFileSync(path.join(solution, "tsconfig.benchmark.json"), "utf8")
                : undefined,
            cwd: solution,
            args: [...workload.args, "--pprofDir", profileDir],
            ...profiled,
            cpuProfile: profiles[0],
            cpuSha256: hash(fs.readFileSync(cpu)),
        });
        console.log(`${workload.name}: collected CPU profile; ${profiled.emitted.files} emitted files`);
    }
}

export function mergeProfiles(input: string, output: string) {
    const expected = [...trainingScenarios].sort();
    const directories = fs.readdirSync(input).sort();
    assert.deepEqual(directories, expected, "Missing or unexpected training workloads");
    const manifests = directories.map(directory =>
        JSON.parse(fs.readFileSync(path.join(input, directory, "manifest.json"), "utf8"))
    );
    const profiles = manifests.map((manifest, index) => {
        assert.equal(manifest.name, directories[index]);
        assert.deepEqual(manifest.seed, manifests[0].seed, "Profiles came from different compiler builds");
        assert.equal(path.basename(manifest.cpuProfile), manifest.cpuProfile, "Invalid profile filename");
        const profile = path.join(input, directories[index], "profiles", manifest.cpuProfile);
        assert.equal(hash(fs.readFileSync(profile)), manifest.cpuSha256, "CPU profile checksum mismatch");
        return profile;
    });
    assert.equal(
        execFileSync("go", ["env", "GOVERSION"], { encoding: "utf8" }).trim(),
        manifests[0].seed.goVersion,
        "Merge must use the seed compiler's Go version",
    );
    fs.mkdirSync(output);
    const merged = execFileSync("go", ["tool", "pprof", "-proto", ...profiles], {
        maxBuffer: 64 * 1024 * 1024,
    });
    const candidate = path.join(output, "default.pgo");
    fs.writeFileSync(candidate, merged);
    // Validate with the same reader used by the Go compiler, before publishing.
    const processed = path.join(output, "default.preprofile");
    execFileSync("go", ["tool", "preprofile", "-i", candidate, "-o", processed]);
    fs.unlinkSync(processed);
    writeJson(path.join(output, "manifest.json"), {
        seed: manifests[0].seed,
        sha256: hash(merged),
        merge: "go tool pprof -proto (no normalization or reweighting)",
        runsPerWorkload: 1,
        checkers: 4,
        workloads: manifests,
    });
    fs.cpSync(input, path.join(output, "workloads"), { recursive: true });
    console.log(`Merged ${profiles.length} profiles into ${candidate} (${merged.length} bytes)`);
}

if (esMain(import.meta)) {
    const [command, ...args] = process.argv.slice(2);
    if (command === "matrix" && args.length === 0) {
        console.log(JSON.stringify({ scenario: trainingScenarios }));
    }
    else if (command === "seed" && args.length === 3) {
        buildSeed(process.cwd(), path.resolve(args[0]), path.resolve(args[1]), args[2]);
    }
    else if (command === "collect" && args.length === 3) {
        collectProfiles(process.cwd(), args[0], path.resolve(args[1]), path.resolve(args[2]));
    }
    else if (command === "merge" && args.length === 2) {
        mergeProfiles(path.resolve(args[0]), path.resolve(args[1]));
    }
    else {
        throw new Error(
            "Usage: generatePgo matrix | seed <checkout> <output> <ref> | collect <scenario> <seed> <output> | merge <input> <output>",
        );
    }
}
