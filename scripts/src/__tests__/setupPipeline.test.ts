import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";

import filenamify from "filenamify";
import { globSync } from "glob";
import { expect, test, vi } from "vitest";

import { allPresetNames, GitParseRevResult, setupPipeline } from "../setupPipeline.js";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const snapshotDir = path.join(__dirname, "__file_snapshots__", "setupPipeline");

const allSnapshotKinds = ["matrix", "outputVariables", "compute", "error", "parameters"] as const;

function getSnapshotPath(input: string, kind: typeof allSnapshotKinds[number]) {
    return path.join(snapshotDir, filenamify(input), `${kind}.snap`);
}

const inputs = [
    ...allPresetNames,
    "default",
    "predictable=true",
    "hosts=bun@1.1.3,vscode@1.88.1",
    "this is not a preset",
    "faster commits=release-5.3...release-5.4",
    "faster commits=release-5.3..release-5.4",
    "faster commits=",
    "faster predictable host=node@18.5.1",
    "startup-only hosts=node@22.8.0",
];

test.each(["baseline", "full"])("native %s retains compiler scenarios after host normalization", async input => {
    const result = await setupPipeline({
        input,
        baselining: input === "baseline",
        isPr: input !== "baseline",
        shouldLog: false,
        gitParseRev: fakeGitRevParse,
        implementation: "corsa",
    });
    const jobs = Object.values(result.matrix).flatMap(jobs => Object.values(jobs));
    expect(jobs.filter(job => job.TSPERF_JOB_SCENARIO === "Compiler-Unions")).toEqual([
        expect.objectContaining({ TSPERF_JOB_KIND: "tsc", TSPERF_JOB_HOST: "native" }),
    ]);
});

test("API preset is opt-in, uses pinned Node rather than native, and processes API reports", async () => {
    const result = await setupPipeline({
        input: "api",
        baselining: false,
        isPr: true,
        shouldLog: false,
        gitParseRev: fakeGitRevParse,
        implementation: "corsa",
    });
    const jobs = Object.values(result.matrix.any);
    expect(jobs.map(job => job.TSPERF_JOB_SCENARIO).sort()).toEqual([
        "typescript-eslint-api-floating",
        "typescript-eslint-api-recommended",
        "vscode-languageserver-api-metamodel",
    ]);
    expect(jobs.every(job => job.TSPERF_JOB_KIND === "api" && job.TSPERF_JOB_HOST === "node@24.21.0")).toBe(true);
    expect(result.outputVariables.TSPERF_PROCESS_KINDS).toBe("api");
    expect(result.parameters.baselineCommit).toBe("HEAD^1");
    expect(result.parameters.newCommit).toBe("HEAD");
});

test("API preset rejects an unpinned host", async () => {
    await expect(setupPipeline({
        input: "api host=native",
        baselining: false,
        isPr: true,
        shouldLog: false,
        gitParseRev: fakeGitRevParse,
        implementation: "corsa",
    })).rejects.toThrow("pinned host");
});

test("API preset rejects predictable mode", async () => {
    await expect(setupPipeline({
        input: "api predictable",
        baselining: false,
        isPr: true,
        shouldLog: false,
        gitParseRev: fakeGitRevParse,
        implementation: "corsa",
    })).rejects.toThrow("does not support predictable mode");
});

async function fakeGitRevParse(query: string): Promise<GitParseRevResult> {
    switch (query) {
        case "release-5.3...release-5.4":
            return {
                baselineCommit: "27047e3391323fa2d8987f46a4c42f5361d07926",
                baselineName: "release-5.3",
                newCommit: "6ea273cdcca99db809074d2b2d38d0e5b59ee81b",
                newName: "release-5.4",
            };
        default:
            throw new Error(`Unknown query: ${query}`);
    }
}

test.each(inputs)("setupPipeline input=%s", async input => {
    const baselining = input === "baseline";

    let result, error;
    try {
        result = await setupPipeline({
            input,
            baselining,
            isPr: !baselining,
            shouldLog: false,
            gitParseRev: fakeGitRevParse,
            implementation: "strada",
        });
    }
    catch (e) {
        error = e;
    }

    await expect(result?.matrix).toMatchFileSnapshot(getSnapshotPath(input, "matrix"));
    await expect(result?.outputVariables).toMatchFileSnapshot(getSnapshotPath(input, "outputVariables"));
    await expect(result?.compute).toMatchFileSnapshot(getSnapshotPath(input, "compute"));
    await expect(result?.parameters).toMatchFileSnapshot(getSnapshotPath(input, "parameters"));
    await expect(error).toMatchFileSnapshot(getSnapshotPath(input, "error"));
});

test.each(inputs)("setupPipeline Corsa input=%s", async input => {
    const baselining = input === "baseline";

    let result, error;
    try {
        result = await setupPipeline({
            input,
            baselining,
            isPr: !baselining,
            shouldLog: false,
            gitParseRev: fakeGitRevParse,
            implementation: "corsa",
        });
    }
    catch (e) {
        error = e;
    }

    await expect(result?.matrix).toMatchFileSnapshot(getSnapshotPath(input + "_tsgo", "matrix"));
    await expect(result?.outputVariables).toMatchFileSnapshot(getSnapshotPath(input + "_tsgo", "outputVariables"));
    await expect(result?.compute).toMatchFileSnapshot(getSnapshotPath(input + "_tsgo", "compute"));
    await expect(result?.parameters).toMatchFileSnapshot(getSnapshotPath(input + "_tsgo", "parameters"));
    await expect(error).toMatchFileSnapshot(getSnapshotPath(input + "_tsgo", "error"));
});

function getAllExpectedSnapshots() {
    return new Set([
        ...allSnapshotKinds.flatMap(kind => inputs.map(input => getSnapshotPath(input, kind))),
        ...allSnapshotKinds.flatMap(kind => inputs.map(input => getSnapshotPath(input + "_tsgo", kind))),
    ]);
}

function getAllActualSnapshots() {
    return new Set(globSync("**/*.snap", { cwd: snapshotDir, absolute: true }));
}

// Inspired by https://github.com/microsoft/DefinitelyTyped-tools/blob/7ff7d6b212946a77e0048002297964f5b51c8714/packages/eslint-plugin/test/eslint.test.ts#L114
test("abandoned snapshots", () => {
    const expectedSnapshots = getAllExpectedSnapshots();
    const actualSnapshots = getAllActualSnapshots();
    const abandonedSnapshots = [...actualSnapshots].filter(s => !expectedSnapshots.has(s));

    if (abandonedSnapshots.length === 0) {
        return;
    }

    // https://github.com/jestjs/jest/issues/8732#issuecomment-516445064
    if ((expect.getState().snapshotState as any)._updateSnapshot === "all") {
        for (const abandoned of abandonedSnapshots) {
            fs.rmSync(abandoned);
        }
        return;
    }

    if (abandonedSnapshots.length) {
        throw new Error(
            "Abandoned snapshots found; please update snapshots to remove them:\n" + abandonedSnapshots.join("\n"),
        );
    }
});

test("reports setup failures without rewriting compiler manifest diagnostics", async () => {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-pipeline-"));
    const exitCode = process.exitCode;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.resetModules();
    vi.doMock("es-main", () => ({ default: () => true }));
    vi.stubEnv("TSPERF_PRESET", "default");
    vi.stubEnv("TYPESCRIPT_DIR", repoDir);
    fs.writeFileSync(
        path.join(repoDir, "package.json"),
        "##vso[task.setvariable variable=BENCH_SCRIPTS]/untrusted/compiler/repo",
    );
    try {
        await import("../setupPipeline.js");
        expect(process.exitCode).toBe(1);
        expect(log).toHaveBeenCalledOnce();
        const diagnostic = log.mock.calls.flat().join("\n");
        expect(diagnostic).toContain("##vso[task");
    }
    finally {
        process.exitCode = exitCode;
        fs.rmSync(repoDir, { recursive: true });
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
        vi.doUnmock("es-main");
        vi.resetModules();
    }
});
