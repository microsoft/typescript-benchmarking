import assert from "assert";
import { $ as _$ } from "execa";
import fs from "fs";
import minimist from "minimist";
import path from "path";

const $ = _$({ verbose: true });

const { stdout: commit } = await $`git rev-parse HEAD`;
const { stdout: commitShort } = await $`git rev-parse --short HEAD`;
const { stdout: date } = await $`git log -1 --format=%cI`;
const { stdout: timestampDir } = await $`date -d ${date} -u +%Y/%m/%d`;

const args = minimist(process.argv.slice(2), {
    string: ["outputDir"],
});

const outputDir = args.outputDir;
assert(outputDir, "Expected output path as first argument");

const packageJson = await fs.promises.readFile("package.json", "utf8");
assert(JSON.parse(packageJson).name === "typescript", "Expected to be run from the TypeScript repo");

await $`mkdir -p ${path.dirname(outputDir)}`;

await $`npm ci`;

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

const info = {
    commit,
    commitShort,
    date,
    timestampDir,
};

const outputInfoPath = path.join(outputDir, "info.json");
const outputInfo = JSON.stringify(info, undefined, 4);

console.log(`Writing ${outputInfoPath} with contents:\n${outputInfo}}`);
await fs.promises.writeFile(outputInfoPath, outputInfo);
