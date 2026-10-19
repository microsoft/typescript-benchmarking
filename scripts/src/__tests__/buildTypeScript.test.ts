import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { moveBuildOutput, removeScratch } from "../buildTypeScript.js";

const sandboxScript = fileURLToPath(new URL("../../buildTypeScriptSandbox.sh", import.meta.url));
const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
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

test("removes scratch trees containing read-only directories", async () => {
    const build = createBuild();
    const moduleDir = path.join(build.home, "go/pkg/mod/example.com/m@v1.0.0");
    fs.mkdirSync(moduleDir, { recursive: true });
    fs.writeFileSync(path.join(moduleDir, "go.mod"), "module example.com/m\n");
    fs.chmodSync(path.join(moduleDir, "go.mod"), 0o444);
    fs.chmodSync(moduleDir, 0o555);
    await removeScratch(build.root);
    expect(fs.existsSync(build.root)).toBe(false);
});

test("rejects a symlinked compiler output directory", async () => {
    const build = createBuild();
    const link = path.join(build.root, "lib");
    fs.symlinkSync(build.source, link);
    await expect(moveBuildOutput(link, build.output)).rejects.toThrow("Expected a regular build output directory");
    expect(fs.existsSync(build.output)).toBe(false);
});

test("rejects a symlinked parent of the compiler output", async () => {
    const build = createBuild();
    fs.mkdirSync(path.join(build.source, "local"));
    const link = path.join(build.root, "built");
    fs.symlinkSync(build.source, link);
    await expect(moveBuildOutput(path.join(link, "local"), build.output, build.root))
        .rejects.toThrow("Expected a regular build output parent directory");
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

test.each([0, 37])("passes build isolation arguments and preserves exit code %i", exitCode => {
    const build = createBuild();
    fs.mkdirSync(path.join(build.source, ".git"));
    const bin = path.join(build.root, "bin");
    const capture = path.join(build.root, "bwrap-args");
    fs.mkdirSync(bin);
    fs.writeFileSync(
        path.join(bin, "bwrap"),
        `#!/usr/bin/env bash
printf '%s\\0' "$@" > "$BWRAP_CAPTURE"
echo 'prefix ##vso[task.setvariable variable=TYPESCRIPT_COMMIT]untrusted'
echo '##[warning]compiler stderr' >&2
exit "$PROBE_EXIT"
`,
        { mode: 0o755 },
    );
    const result = spawnSync("bash", [sandboxScript, build.source, build.home, build.tmp, "npm", "ci"], {
        env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            AGENT_TOOLSDIRECTORY: bin,
            BWRAP_CAPTURE: capture,
            PROBE_EXIT: String(exitCode),
            SYNTHETIC_SECRET: "must-not-be-forwarded",
        },
        encoding: "utf8",
        timeout: 10_000,
    });
    expect(result.status).toBe(exitCode);
    expect(result.stdout).toContain("prefix ##vso[task.setvariable variable=TYPESCRIPT_COMMIT]untrusted");
    expect(result.stderr).toContain("##[warning]compiler stderr");
    const args = fs.readFileSync(capture, "utf8").split("\0").slice(0, -1);
    expect(args).toContain("--clearenv");
    expect(args).toContain("--unshare-user");
    expect(args).toContain("--unshare-pid");
    expect(args).toContain("--die-with-parent");
    expect(args).toContain("--new-session");
    const metadataIndex = args.indexOf(`${build.source}/.git`);
    expect(args.slice(metadataIndex - 1, metadataIndex + 2)).toEqual([
        "--ro-bind",
        `${build.source}/.git`,
        `${build.source}/.git`,
    ]);
    // The home bind must follow the /tmp bind, or a home under the host's /tmp is hidden.
    const tmpIndex = args.indexOf("/tmp");
    expect(args.slice(tmpIndex - 2, tmpIndex + 1)).toEqual(["--bind", build.tmp, "/tmp"]);
    const homeBindIndex = args.findIndex((arg, i) => arg === "--bind" && args[i + 1] === build.home);
    expect(homeBindIndex).toBeGreaterThan(tmpIndex);
    expect(args.slice(-2)).toEqual(["npm", "ci"]);
    expect(args).not.toContain("SYNTHETIC_SECRET");
    expect(args).not.toContain("must-not-be-forwarded");
});
