import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { checkCompilation, collectProfiles, getWorkloads, mergeProfiles, trainingScenarios } from "../generatePgo.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const temporary: string[] = [];

afterEach(() => {
    for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true });
});

test("training uses twelve existing compiler scenarios, including XState", () => {
    const workloads = trainingScenarios.flatMap(scenario => getWorkloads(root, scenario, "/scratch/emit"));
    expect(workloads).toHaveLength(12);
    expect(workloads.some(workload => workload.name === "xstate-main")).toBe(true);
    for (const scenario of trainingScenarios) {
        expect(fs.existsSync(path.join(root, "cases/scenarios", scenario, "setup.sh"))).toBe(true);
    }
    for (const workload of workloads) {
        expect(workload.args).toEqual(expect.arrayContaining([
            "--diagnostics",
            "false",
            "--extendedDiagnostics",
            "false",
        ]));
        expect(workload.args.some(arg => arg.includes("${"))).toBe(false);
        expect(workload.args).not.toContain("--pprofDir");
        if (workload.build) {
            expect(workload.args).toContain("--force");
        }
        else {
            expect(workload.args).toEqual(expect.arrayContaining([
                "--noEmit",
                "false",
                "--noEmitOnError",
                "false",
                "--outDir",
                "/scratch/emit",
            ]));
        }
    }
});

test("training does not add ad-hoc workloads and disables TanStack's cyclic declaration emit", () => {
    const t3code = getWorkloads(root, "t3code-server", "/scratch/emit");
    expect(t3code.map(workload => workload.name)).toEqual(["t3code-server"]);
    const [tanstack] = getWorkloads(root, "tanstack-router", "/scratch/emit");
    expect(tanstack.args.slice(-2)).toEqual(["--declaration", "false"]);
    expect(() => getWorkloads(root, "../other", "/scratch/emit")).toThrow("Unknown training scenario");
});

test("compiler diagnostics are retained but crashes, unexplained failures and statistics are rejected", () => {
    expect(checkCompilation(0, null, "")).toMatchObject({ count: 0 });
    expect(checkCompilation(2, null, "file.ts(1,1): error TS2322: Existing error.")).toMatchObject({ count: 1 });
    expect(() => checkCompilation(null, "SIGKILL", "")).toThrow("Compiler terminated");
    expect(() => checkCompilation(2, null, "panic: broken")).toThrow("Compiler crashed");
    expect(() => checkCompilation(2, null, "unexpected failure")).toThrow("Compiler failed");
    expect(() => checkCompilation(0, null, "file.ts: error TS2322: Error.")).toThrow("diagnostic exit status");
    expect(() => checkCompilation(0, null, "Memory allocs: 123")).toThrow("Diagnostic reporting");
    expect(() => checkCompilation(0, null, "Aggregate Total time: 1s")).toThrow("Diagnostic reporting");
});

test("merge rejects an incomplete corpus rather than publishing a partial profile", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pgo-test-"));
    temporary.push(directory);
    const input = path.join(directory, "input");
    const output = path.join(directory, "output");
    fs.mkdirSync(input);
    fs.mkdirSync(path.join(input, "effect"));
    expect(() => mergeProfiles(input, output)).toThrow("Missing or unexpected training workloads");
    expect(fs.existsSync(output)).toBe(false);
});

test("collection profiles once, restores artifact permissions, and checks emitted bytes against preflight", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pgo-collect-test-"));
    temporary.push(directory);
    const scenario = path.join(directory, "cases/scenarios/class-transformer");
    const solution = path.join(directory, "cases/solutions/class-transformer");
    const seed = path.join(directory, "seed");
    const output = path.join(directory, "output");
    for (const dir of [scenario, solution, seed]) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(
        path.join(root, "cases/scenarios/class-transformer/scenario.json"),
        path.join(scenario, "scenario.json"),
    );
    fs.writeFileSync(path.join(solution, "tsconfig.benchmark.json"), "{}");
    execFileSync("git", ["init", "-q", solution]);
    execFileSync("git", [
        "-C",
        solution,
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "--allow-empty",
        "-qm",
        "fixture",
    ]);
    execFileSync("git", ["-C", solution, "remote", "add", "origin", "https://example.com/fixture"]);
    const binary = path.join(seed, "tsc");
    fs.writeFileSync(
        binary,
        `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const out = args[args.lastIndexOf("--outDir") + 1];
fs.appendFileSync(path.join(__dirname, "invocations.jsonl"), JSON.stringify(args) + "\\n");
fs.writeFileSync(path.join(out, "file.js"), "export const x = 1;");
const profileIndex = args.indexOf("--pprofDir");
if (profileIndex !== -1) {
    fs.writeFileSync(path.join(args[profileIndex + 1], "123-cpuprofile.pb.gz"), "profile fixture");
}
`,
    );
    fs.writeFileSync(
        path.join(seed, "seed.json"),
        JSON.stringify({
            sha256: createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
        }),
    );
    collectProfiles(directory, "class-transformer", seed, output);
    const invocations: string[][] = fs.readFileSync(path.join(seed, "invocations.jsonl"), "utf8")
        .trim().split("\n").map(line => JSON.parse(line));
    expect(invocations).toHaveLength(2);
    expect(invocations[0]).not.toContain("--pprofDir");
    expect(invocations[1]).toContain("--pprofDir");
    const manifest = JSON.parse(fs.readFileSync(path.join(output, "class-transformer/manifest.json"), "utf8"));
    expect(manifest.emitted.files).toBe(1);
    expect(manifest.diagnostics.count).toBe(0);
    expect(manifest.benchmarkConfig).toBe("{}");
    expect(fs.existsSync(path.join(output, "emit"))).toBe(false);
    // A changed profiled output must fail even when both compilations exit successfully.
    fs.writeFileSync(
        binary,
        fs.readFileSync(binary, "utf8").replace(
            "if (profileIndex !== -1) {",
            'if (profileIndex !== -1) { fs.writeFileSync(path.join(out, "file.js"), "changed");',
        ),
    );
    fs.writeFileSync(
        path.join(seed, "seed.json"),
        JSON.stringify({
            sha256: createHash("sha256").update(fs.readFileSync(binary)).digest("hex"),
        }),
    );
    expect(() => collectProfiles(directory, "class-transformer", seed, path.join(directory, "changed")))
        .toThrow("Profiling changed diagnostics or emitted output");
});
