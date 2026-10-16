import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { verifyArtifact } from "./artifact.mjs";
import { run, verifyResolution } from "./utils.mjs";

const workDir = process.cwd();
const artifact = await verifyArtifact(process.argv[2]);
const repo = workDir;
const alias = path.join(repo, "node_modules/@typescript/native");
await fs.rm(alias, { recursive: true });
await fs.symlink(artifact.packageDir, alias, "junction");
await verifyResolution(path.join(repo, "tools"), artifact);
const output = path.join(repo, "protocol/metaModel.json");
await fs.rm(output, { force: true });
run("npm", ["run", "generate:metaModel"], repo);
assert.deepEqual(
    JSON.parse(await fs.readFile(output, "utf8")),
    JSON.parse(await fs.readFile(path.join(workDir, "expected.json"), "utf8")),
    "Generated metamodel differs from the checked-in output",
);
await fs.unlink(output);
