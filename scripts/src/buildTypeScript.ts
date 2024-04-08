import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import minimist from "minimist";

import { $, $pipe, getNonEmptyEnv, parseBoolean, RepoInfo, retry, setOutputVariable } from "./utils.js";

const { stdout: commit } = await $pipe`git rev-parse HEAD`;
const { stdout: commitShort } = await $pipe`git rev-parse --short HEAD`;
const { stdout: date } = await $pipe`git log -1 --format=%cI`;
const { stdout: timestampDir } = await $pipe`date -d ${date} -u +%Y/%m/%d`;

const args = minimist(process.argv.slice(2), {
    string: ["outputDir"],
    boolean: ["baseline"],
});

const outputDir = args.outputDir;
assert(outputDir, "Expected output path as first argument");

const packageJson = await fs.promises.readFile("package.json", "utf8");
assert(JSON.parse(packageJson).name === "typescript", "Expected to be run from the TypeScript repo");

await $`mkdir -p ${path.dirname(outputDir)}`;

await retry(() => $`npm ci`);

if (fs.existsSync("Herebyfile.mjs")) {
    await $`npx hereby lkg`;
    await $`mv lib ${outputDir}`;
}
else {
    await $`npm run build:compiler`;
    await $`mv built/local ${outputDir}`;
}

await $`git clean -fddx`;
await $`git reset --hard HEAD`;

let branch: string | undefined;

const isPR = parseBoolean(process.env.IS_PR, false);
const isComparison = parseBoolean(getNonEmptyEnv("TSPERF_IS_COMPARISON"), false);
const ref = getNonEmptyEnv("REF");

if (isComparison) {
    const newCommit = getNonEmptyEnv("TSPERF_NEW_COMMIT");
    const baselineCommit = getNonEmptyEnv("TSPERF_BASELINE_COMMIT");

    if (isPR && newCommit === "HEAD" && baselineCommit === "HEAD^1") {
        // This is a typical PR run. Pull the branch info from the PR.
        if (args.baseline) {
            const prNumber = ref.split("/")[2];
            const resp = await fetch(`https://api.github.com/repos/microsoft/TypeScript/pulls/${prNumber}`);
            const pr = await resp.json();
            branch = (pr as any).base.ref;
        }
        else {
            branch = ref;
        }
    }
    else {
        // This is a comparison run via a parameter. Don't bother setting the branch.
    }
}
else {
    // TODO(jakebailey): what about commit=<single commit>?
    assert(ref.startsWith("refs/heads/"), "Expected ref to start with refs/heads/");
    branch = ref.replace(/^refs\/heads\//, "");
}

const info: RepoInfo = {
    commit,
    commitShort,
    branch,
    date,
    timestampDir,
};

const outputInfoPath = path.join(outputDir, "info.json");
const outputInfo = JSON.stringify(info, undefined, 4);

console.log(`Writing ${outputInfoPath} with contents:\n${outputInfo}}`);
await fs.promises.writeFile(outputInfoPath, outputInfo);

setOutputVariable("TYPESCRIPT_COMMIT", commit);
