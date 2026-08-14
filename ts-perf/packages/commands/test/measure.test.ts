import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { resolveBuiltPath } from "../src/benchmark/measure.js";

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createBuiltDir(file: string) {
    const builtDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-"));
    tempDirs.push(builtDir);
    fs.writeFileSync(path.join(builtDir, file), "");
    return builtDir;
}

test("resolves the JavaScript compiler", () => {
    const builtDir = createBuiltDir("tsc.js");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsc.js"));
});

test("resolves the legacy tsgo compiler", () => {
    const builtDir = createBuiltDir("tsgo");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsgo"));
});

test("resolves the migrated native compiler for compiler and LSP scenarios", () => {
    const builtDir = createBuiltDir("tsc");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsc"));
    expect(resolveBuiltPath(builtDir, "tsgo")).toBe(path.join(builtDir, "tsc"));
});
