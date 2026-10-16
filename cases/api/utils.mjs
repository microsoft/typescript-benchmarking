import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export function run(command, args, cwd) {
    return execFileSync(command, args, {
        cwd,
        stdio: "inherit",
    });
}

export async function verifyResolution(from, artifact) {
    const actual = createRequire(path.join(from, "package.json"));
    const expected = createRequire(path.join(artifact.packageDir, "package.json"));
    assert.equal(
        await fs.realpath(actual.resolve("@typescript/native/unstable/sync")),
        await fs.realpath(expected.resolve("typescript/unstable/sync")),
        "Consumer resolved a registry compiler",
    );
}
