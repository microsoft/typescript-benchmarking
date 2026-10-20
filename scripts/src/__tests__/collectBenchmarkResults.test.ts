import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import { collectBenchmarkResults } from "../collectBenchmarkResults.js";
import { JobKind } from "../setupPipeline.js";

const tempDirs: string[] = [];

afterEach(() => {
    vi.restoreAllMocks();
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createWorkspace() {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-results-"));
    tempDirs.push(workspace);
    const outputDir = path.join(workspace, "benchmarks");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    function createJob(kind: JobKind, jobName: string, isComparison = true) {
        const artifactDir = path.join(workspace, `PartialBenchmark_${jobName}`);
        fs.mkdirSync(artifactDir);
        for (const prefix of isComparison ? ["baseline", "new"] : ["baseline"]) {
            fs.writeFileSync(path.join(artifactDir, `${prefix}_${jobName}.${kind}.benchmark`), prefix);
        }
        return artifactDir;
    }

    return { workspace, outputDir, createJob, log };
}

test("collects exact scheduled results without reading or logging compiler and extra artifact files", async () => {
    const fixture = createWorkspace();
    const tsc = "tsc_node_probe";
    const startup = "startup_native_probe";
    const artifactDir = fixture.createJob("tsc", tsc);
    fixture.createJob("startup", startup);
    fixture.createJob("tsc", "tsc_node_unscheduled");
    const filename = "##vso[task.setvariable variable=TSPERF_NEW_NAME]$(id) #.benchmark";
    fs.writeFileSync(path.join(artifactDir, filename), "untrusted");
    const compilerDir = path.join(fixture.workspace, "BuiltTypeScript/new");
    fs.mkdirSync(compilerDir, { recursive: true });
    fs.writeFileSync(path.join(compilerDir, filename), "untrusted");
    fs.writeFileSync(path.join(compilerDir, `baseline_${tsc}.tsc.benchmark`), "compiler");

    await collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: true,
        jobNamesByKind: { tsc: [tsc], startup: [startup] },
    });

    expect(fs.readdirSync(fixture.outputDir).sort()).toEqual([
        `baseline_${startup}.startup.benchmark`,
        `baseline_${tsc}.tsc.benchmark`,
        `new_${startup}.startup.benchmark`,
        `new_${tsc}.tsc.benchmark`,
    ]);
    expect(fs.readFileSync(path.join(fixture.outputDir, `baseline_${tsc}.tsc.benchmark`), "utf8")).toBe("baseline");
    expect(fixture.log.mock.calls.flat().join("\n")).not.toContain("##vso[");
    expect(fs.existsSync(path.join(artifactDir, filename))).toBe(true);
    expect(fs.existsSync(path.join(compilerDir, filename))).toBe(true);
});

test("collects only baseline files for a baseline-only run", async () => {
    const fixture = createWorkspace();
    const jobName = "lsp_native_probe";
    fixture.createJob("lsp", jobName, false);
    await collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { lsp: [jobName] },
    });
    expect(fs.readdirSync(fixture.outputDir)).toEqual([`baseline_${jobName}.lsp.benchmark`]);
});

test("fails on a missing scheduled result rather than using a compiler artifact with the same name", async () => {
    const fixture = createWorkspace();
    const jobName = "tsc_native_probe";
    const artifactDir = fixture.createJob("tsc", jobName, false);
    const filename = `baseline_${jobName}.tsc.benchmark`;
    fs.unlinkSync(path.join(artifactDir, filename));
    const compilerDir = path.join(fixture.workspace, "BuiltTypeScript/baseline");
    fs.mkdirSync(compilerDir, { recursive: true });
    fs.writeFileSync(path.join(compilerDir, filename), "compiler");
    await expect(collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { tsc: [jobName] },
    })).rejects.toMatchObject({ code: "ENOENT" });
    expect(fs.readdirSync(fixture.outputDir)).toEqual([]);
});

test.each(["symlink", "fifo"])("rejects a scheduled %s rather than following or opening it", async kind => {
    const fixture = createWorkspace();
    const jobName = "tsserver_node_probe";
    const artifactDir = fixture.createJob("tsserver", jobName, false);
    const source = path.join(artifactDir, `baseline_${jobName}.tsserver.benchmark`);
    fs.unlinkSync(source);
    if (kind === "symlink") {
        fs.symlinkSync("/nonexistent", source);
    }
    else {
        execFileSync("mkfifo", [source]);
    }
    await expect(collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { tsserver: [jobName] },
    })).rejects.toThrow("Expected a regular benchmark result");
});

test("rejects symlinked artifact directories", async () => {
    const fixture = createWorkspace();
    const jobName = "tsc_node_probe";
    const artifactDir = fixture.createJob("tsc", jobName, false);
    fs.renameSync(artifactDir, `${artifactDir}_original`);
    fs.symlinkSync(`${artifactDir}_original`, artifactDir);
    await expect(collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { tsc: [jobName] },
    })).rejects.toThrow("Expected a regular partial artifact directory");
});

test("rejects path traversal in scheduled names", async () => {
    const fixture = createWorkspace();
    await expect(collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { tsc: ["../outside"] },
    })).rejects.toThrow("Unexpected benchmark job name");
});

test("does not overwrite an existing destination", async () => {
    const fixture = createWorkspace();
    const jobName = "tsc_node_probe";
    fixture.createJob("tsc", jobName, false);
    fs.mkdirSync(fixture.outputDir);
    const destination = path.join(fixture.outputDir, `baseline_${jobName}.tsc.benchmark`);
    fs.writeFileSync(destination, "existing");
    await expect(collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { tsc: [jobName] },
    })).rejects.toMatchObject({ code: "EEXIST" });
    expect(fs.readFileSync(destination, "utf8")).toBe("existing");
});
