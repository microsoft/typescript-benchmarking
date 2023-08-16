import assert from "assert";
import { $ as _$ } from "execa";
import fs from "fs";
import minimist from "minimist";
import fetch from "node-fetch";
import path from "path";

import { retry } from "./utils.mjs";

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

const isPR = (process.env.IS_PR || "").toUpperCase() === "TRUE";

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

let branch;

const ref = process.env.REF;
assert(ref, "Expected REF environment variable to be set");

if (isPR) {
    if (args.baseline) {
        const prNumber = ref.split("/")[2];
        const resp = await fetch(`https://api.github.com/repos/microsoft/TypeScript/pulls/${prNumber}`);
        const pr = await resp.json();
        branch = /** @type {any} */ (pr).base.ref;
    }
    else {
        branch = ref;
    }
}
else {
    assert(ref.startsWith("refs/heads/"), "Expected ref to start with refs/heads/");
    branch = ref.replace(/^refs\/heads\//, "");
}

/** @type {import("./utils.mjs").RepoInfo} */
const info = {
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
