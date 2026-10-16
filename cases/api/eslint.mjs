import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { verifyArtifact } from "./artifact.mjs";
import { run, verifyResolution } from "./utils.mjs";

const workDir = process.cwd();
const artifact = await verifyArtifact(process.argv[2]);
const checkoutDir = workDir;
// Workspace packages resolve peers locally; a fixture-level alias alone is insufficient.
for (
    const directory of [
        checkoutDir,
        ...(await fs.readdir(path.join(checkoutDir, "packages")))
            .map(name => path.join(checkoutDir, "packages", name)),
    ]
) {
    const alias = path.join(directory, "node_modules/@typescript/native");
    const stat = await fs.lstat(alias).catch(error => {
        if (error.code !== "ENOENT") throw error;
    });
    if (!stat) continue;
    assert(stat.isSymbolicLink(), "Refusing to replace a non-link native dependency");
    await fs.unlink(alias);
    await fs.symlink(artifact.packageDir, alias, "junction");
}
await verifyResolution(path.join(checkoutDir, "packages/typescript-estree"), artifact);
const fixture = await fs.realpath(path.join(workDir, "fixture"));
const output = path.join(fixture, "results.json");
await fs.rm(output, { force: true });
try {
    run("npm", ["run", "lint", "--", "--format", "json", "--output-file", "results.json"], fixture);
    assert.fail("Expected one lint finding");
}
catch (error) {
    if (error.status !== 1) throw error;
}
const results = JSON.parse(await fs.readFile(output, "utf8"));
assert.equal(results.length, 1024, "ESLint skipped fixture files");
const messages = results.flatMap(result => {
    assert.equal(result.fatalErrorCount, 0, "ESLint parser failure");
    return result.messages;
});
assert.equal(messages.length, 1, "Unexpected lint findings");
assert.equal(messages[0].ruleId, "@typescript-eslint/no-floating-promises");
await fs.unlink(output);
