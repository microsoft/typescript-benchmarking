import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect } from "node:util";

import { afterEach, expect, test } from "vitest";

import { detectTypeScriptImplementation } from "../typeScriptRepo.js";

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createRepo(packageName: string, files: string[] = []) {
    const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-"));
    tempDirs.push(repoDir);
    fs.writeFileSync(path.join(repoDir, "package.json"), JSON.stringify({ name: packageName }));
    for (const file of files) {
        const filePath = path.join(repoDir, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, "");
    }
    return repoDir;
}

test("detects the Strada implementation", () => {
    expect(detectTypeScriptImplementation(createRepo("typescript"))).toBe("strada");
});

test("detects the legacy typescript-go repository as Corsa", () => {
    expect(detectTypeScriptImplementation(createRepo("typescript-go"))).toBe("corsa");
});

test("detects the migrated Corsa implementation from its root package name", () => {
    expect(detectTypeScriptImplementation(createRepo("@typescript/repo"))).toBe("corsa");
});

test("returns undefined when the compiler manifest is missing", () => {
    const repoDir = createRepo("typescript");
    fs.unlinkSync(path.join(repoDir, "package.json"));
    expect(detectTypeScriptImplementation(repoDir)).toBeUndefined();
});

test.each(["symlink", "broken symlink", "directory", "fifo"])("rejects a %s compiler manifest", kind => {
    const repoDir = createRepo("typescript");
    const packageJson = path.join(repoDir, "package.json");
    fs.unlinkSync(packageJson);
    switch (kind) {
        case "symlink":
            fs.symlinkSync(path.join(createRepo("typescript"), "package.json"), packageJson);
            break;
        case "broken symlink":
            fs.symlinkSync("/nonexistent", packageJson);
            break;
        case "directory":
            fs.mkdirSync(packageJson);
            break;
        case "fifo":
            execFileSync("mkfifo", [packageJson]);
            break;
    }
    expect(() => detectTypeScriptImplementation(repoDir)).toThrow("Expected a regular compiler package.json");
});

test.each(["##vso[task.debug]x", "##[warning]x"])("preserves malformed compiler manifest diagnostics for %j", text => {
    const repoDir = createRepo("typescript");
    fs.writeFileSync(path.join(repoDir, "package.json"), text);
    let error: unknown;
    try {
        detectTypeScriptImplementation(repoDir);
    }
    catch (caught) {
        error = caught;
    }
    expect(error).toBeInstanceOf(SyntaxError);
    const diagnostic = inspect(new Error("Failed to detect compiler implementation", { cause: error }));
    expect(diagnostic).toContain(text);
});
