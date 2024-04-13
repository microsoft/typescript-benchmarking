import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

import { $ as _$ } from "execa";
import minimist from "minimist";
import { Octokit } from "octokit";

import { getNonEmptyEnv, parseBoolean, RepoInfo, retry, setOutputVariable } from "./utils.js";

const $pipe = _$({ verbose: true });
const $ = _$({ verbose: true, stdio: "inherit" });

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

const isPR = parseBoolean(getNonEmptyEnv("IS_PR"), false);
const ref = getNonEmptyEnv("REF");

let branch;

if (isPR) {
    const prefix = "refs/pull/";
    assert(ref.startsWith(prefix), `Expected ref to start with ${prefix}`);

    if (args.baseline) {
        const prNumber = ref.slice(prefix.length).split("/")[0];

        const octokit = new Octokit();
        const pr = await octokit.rest.pulls.get({
            owner: "microsoft",
            repo: "TypeScript",
            pull_number: +prNumber,
        });
        branch = pr.data.base.ref;
    }
    else {
        branch = ref;
    }
}
else {
    const prefix = "refs/heads/";
    assert(ref.startsWith(prefix), `Expected ref to start with ${prefix}`);
    branch = ref.slice(prefix.length);
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
