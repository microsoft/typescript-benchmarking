import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { moveBuildOutput } from "../buildTypeScript.js";

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createBuild() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-build-"));
    tempDirs.push(root);
    const source = path.join(root, "source");
    const output = path.join(root, "output");
    const home = path.join(root, "home");
    const tmp = path.join(root, "tmp");
    for (const directory of [source, home, tmp]) {
        fs.mkdirSync(directory);
    }
    return { root, source, output, home, tmp };
}

test("collects regular compiler outputs, including nested files", async () => {
    const build = createBuild();
    fs.mkdirSync(path.join(build.source, "nested"));
    fs.writeFileSync(path.join(build.source, "nested/tsc.js"), "compiler");
    await moveBuildOutput(build.source, build.output);
    expect(fs.readFileSync(path.join(build.output, "nested/tsc.js"), "utf8")).toBe("compiler");
    expect(fs.existsSync(build.source)).toBe(false);
});

test("rejects a symlinked compiler output directory", async () => {
    const build = createBuild();
    const link = path.join(build.root, "lib");
    fs.symlinkSync(build.source, link);
    await expect(moveBuildOutput(link, build.output)).rejects.toThrow("Expected a regular build output directory");
    expect(fs.existsSync(build.output)).toBe(false);
});

test.each(["file", "directory"])("rejects nested %s symlinks in compiler outputs", async kind => {
    const build = createBuild();
    const target = path.join(build.root, "target");
    if (kind === "directory") {
        fs.mkdirSync(target);
    }
    else {
        fs.writeFileSync(target, "host-only data");
    }
    fs.symlinkSync(target, path.join(build.source, "link"));
    await expect(moveBuildOutput(build.source, build.output)).rejects.toThrow("Unexpected build output");
    expect(fs.existsSync(build.output)).toBe(false);
});

test("rejects nonregular build outputs without copying or opening them", async () => {
    const build = createBuild();
    execFileSync("mkfifo", [path.join(build.source, "pipe")]);
    await expect(moveBuildOutput(build.source, build.output)).rejects.toThrow("Unexpected build output");
    expect(fs.existsSync(build.output)).toBe(false);
});

test("neutralizes logging commands in rejected build filenames", async () => {
    const build = createBuild();
    const filename = "##vso[task.debug]output";
    fs.symlinkSync("/nonexistent", path.join(build.source, filename));
    await expect(moveBuildOutput(build.source, build.output)).rejects.toThrow("# #vso[task.debug]output");
});

test.each([
    "##vso[task.setvariable variable=TSPERF_NEW_NAME]$(id) #.benchmark",
    "prefix##[warning]compiler.js",
    "with\nnewline.js",
    "with\u007Fdelete.js",
    "with\u0085control.js",
])("rejects unsafe regular build filename %j", async filename => {
    const build = createBuild();
    fs.writeFileSync(path.join(build.source, filename), "compiler");
    await expect(moveBuildOutput(build.source, build.output)).rejects.toThrow("Unsafe build output filename");
    expect(fs.existsSync(build.output)).toBe(false);
});

test("rejects logging-command markers in directory names", async () => {
    const build = createBuild();
    const directory = path.join(build.source, "##vso[task.debug]nested");
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "tsc.js"), "compiler");
    await expect(moveBuildOutput(build.source, build.output)).rejects.toThrow("Unsafe build output filename");
    expect(fs.existsSync(build.output)).toBe(false);
});
