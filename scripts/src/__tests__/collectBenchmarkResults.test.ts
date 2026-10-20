import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test, vi } from "vitest";
import { parse } from "yaml";

import { collectBenchmarkResults } from "../collectBenchmarkResults.js";
import { JobKind, setupPipeline } from "../setupPipeline.js";
import { validateBenchmarkArtifacts, validateProcessedResults } from "../validateBenchmarkResults.js";

const tempDirs: string[] = [];

function* scriptSteps(value: unknown): Generator<Record<string, unknown>> {
    if (Array.isArray(value)) {
        for (const item of value) {
            yield* scriptSteps(item);
        }
    }
    else if (typeof value === "object" && value !== null) {
        if ("bash" in value || "script" in value || "task" in value && value.task === "AzureCLI@2") {
            yield value as Record<string, unknown>;
        }
        for (const child of Object.values(value)) {
            yield* scriptSteps(child);
        }
    }
}

function readYaml(relativePath: string): unknown {
    return parse(fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"));
}

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

test.each(["lsp", "api"] as const)("collects only baseline files for a baseline-only %s run", async kind => {
    const fixture = createWorkspace();
    const jobName = `${kind}_node_probe`;
    fixture.createJob(kind, jobName, false);
    await collectBenchmarkResults({
        workspace: fixture.workspace,
        outputDir: fixture.outputDir,
        isComparison: false,
        jobNamesByKind: { [kind]: [jobName] },
    });
    expect(fs.readdirSync(fixture.outputDir)).toEqual([`baseline_${jobName}.${kind}.benchmark`]);
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

test.each(["baseline", "default", "api"])("allows the actual %s setup output variables", async input => {
    const result = await setupPipeline({
        input,
        baselining: input === "baseline",
        isPr: input !== "baseline",
        shouldLog: false,
        implementation: "corsa",
        gitParseRev: async () => {
            throw new Error("Unexpected revision query");
        },
    });
    const publisher = [...scriptSteps(readYaml("../../../build/benchmark.yml"))]
        .find(step => step.name === "setupPipeline");
    expect(publisher?.target).toEqual({
        commands: "restricted",
        settableVariables: expect.arrayContaining(Object.keys(result.outputVariables)),
    });
});

test.each([false, true])("independently requires every processed output (comparison: %s)", async isComparison => {
    const fixture = createWorkspace();
    fs.mkdirSync(fixture.outputDir);
    const report = path.join(fixture.workspace, "comment.html");
    const validate = () =>
        validateProcessedResults({ mergedDir: fixture.outputDir, report, kinds: ["tsc", "api"], isComparison });
    await expect(validate()).rejects.toThrow("Missing or nonregular merged benchmark result");
    for (const kind of ["tsc", "api"]) {
        for (const prefix of isComparison ? ["baseline", "new"] : ["baseline"]) {
            fs.writeFileSync(path.join(fixture.outputDir, `${prefix}.${kind}.benchmark`), "{}");
        }
    }
    await expect(validate()).rejects.toThrow("Missing or nonregular benchmark report");
    fs.writeFileSync(report, "<table></table>");
    await validate();
    fs.unlinkSync(report);
    fs.symlinkSync(path.join(fixture.outputDir, "baseline.api.benchmark"), report);
    await expect(validate()).rejects.toThrow("Missing or nonregular benchmark report");
});

test.each([false, true])(
    "publishes only expected benchmark artifact filenames (comparison: %s)",
    async isComparison => {
        const fixture = createWorkspace();
        fs.mkdirSync(fixture.outputDir);
        const validate = () =>
            validateBenchmarkArtifacts({
                artifactsDir: fixture.outputDir,
                jobName: "api_node_probe",
                jobKind: "api",
                isComparison,
            });
        await expect(validate()).rejects.toThrow("Unexpected benchmark artifact files");
        for (const prefix of isComparison ? ["baseline", "new"] : ["baseline"]) {
            fs.writeFileSync(path.join(fixture.outputDir, `${prefix}_api_node_probe.api.benchmark`), "{}");
        }
        await validate();
        const unexpected = "##vso[task.setvariable variable=GH_TOKEN]injected.benchmark";
        fs.writeFileSync(path.join(fixture.outputDir, unexpected), "{}");
        await expect(validate()).rejects.toThrow(/^Unexpected benchmark artifact files$/);
        fs.unlinkSync(path.join(fixture.outputDir, unexpected));
        const baseline = path.join(fixture.outputDir, "baseline_api_node_probe.api.benchmark");
        fs.unlinkSync(baseline);
        fs.symlinkSync("/nonexistent", baseline);
        await expect(validate()).rejects.toThrow("Missing or nonregular benchmark artifact");
    },
);
