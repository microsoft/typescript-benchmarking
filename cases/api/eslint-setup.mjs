import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const fileCount = 1024;

const workDir = process.cwd();
const rules = process.argv[2];
assert(["floating", "recommended"].includes(rules));
const performanceDir = path.join(workDir, "performance");

// Use the generator unchanged, with Prettier and ESLint fixed by the consumer's pnpm lockfile.
await fs.rm(path.join(performanceDir, "node_modules"), { force: true });
await fs.symlink("../node_modules", path.join(performanceDir, "node_modules"), "junction");
const { writeCaseFiles } = await import(
    pathToFileURL(path.join(performanceDir, "src/creators/writeCaseFiles.ts")).href
);
const fixture = path.join(workDir, "fixture");
await fs.mkdir(fixture, { recursive: true });
await fs.writeFile(path.join(fixture, "package.json"), '{"type":"module","private":true}\n');
await fs.rm(path.join(fixture, "node_modules"), { force: true });
await fs.symlink("../node_modules", path.join(fixture, "node_modules"), "junction");
const data = {
    name: "api-lint",
    files: fileCount,
    layout: "even",
    rules,
    singleRun: false,
    types: "native",
};
await writeCaseFiles(data, fixture);
const packageFile = path.join(fixture, "package.json");
const upstreamPackage = await import(
    pathToFileURL(path.join(performanceDir, "src/creators/files/createPackageFile.ts")).href
);
await fs.writeFile(
    packageFile,
    JSON.stringify({ type: "module", scripts: upstreamPackage.createPackageFile(data).scripts }),
);
// ESLint's CLI does not clear parser caches; close its synchronous native client before process exit.
await fs.appendFile(
    path.join(fixture, "eslint.config.js"),
    '\nimport { clearCaches } from "@typescript-eslint/parser";\nprocess.once("exit", clearCaches);\n',
);
const files = (await fs.readdir(path.join(fixture, "src"), { recursive: true }))
    .filter(file => file.endsWith(".ts"));
assert.equal(files.length, fileCount, "Generator produced an unexpected number of files");
