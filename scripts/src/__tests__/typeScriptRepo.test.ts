import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
