import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esMain from "es-main";
import minimist from "minimist";
import { Octokit } from "octokit";

import { preserveApiArtifact } from "./apiArtifact.js";
import { detectTypeScriptImplementation } from "./typeScriptRepo.js";
import { $, $pipe, getNonEmptyEnv, parseBoolean, RepoInfo, retry, validateBuildOutput } from "./utils.js";

export async function moveBuildOutput(source: string, output: string, root = path.dirname(path.resolve(source))) {
    await validateBuildOutput(source, root);
    await $`mv -- ${source} ${output}`;
}

// Go's module cache is read-only, so make the tree writable before removing it.
export async function removeScratch(scratch: string) {
    await $`chmod -R u+w -- ${scratch}`;
    await fs.promises.rm(scratch, { recursive: true });
}

async function main() {
    const { stdout: commit } = await $pipe`git rev-parse HEAD`;
    const { stdout: commitShort } = await $pipe`git rev-parse --short HEAD`;
    const { stdout: date } = await $pipe`git log -1 --format=%cI`;
    const { stdout: timestampDir } = await $pipe`date -d ${date} -u +%Y/%m/%d`;

    const args = minimist(process.argv.slice(2), {
        string: ["outputDir", "variablesFile"],
        boolean: ["baseline"],
    });

    const outputDir = args.outputDir;
    assert(outputDir, "Expected output path as first argument");
    assert(typeof args.variablesFile === "string" && args.variablesFile, "Expected --variablesFile");

    const implementation = detectTypeScriptImplementation(".");
    assert(implementation, "Expected to be run from the TypeScript repo");
    const isCorsa = implementation === "corsa";
    const buildApi = process.env.TSPERF_PROCESS_KINDS?.split(/\s+/).includes("api") ?? false;
    assert(!buildApi || isCorsa, "The api preset requires native TypeScript 7");

    const sourceDir = process.cwd();
    const sandboxScript = fileURLToPath(new URL("../buildTypeScriptSandbox.sh", import.meta.url));
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tsperf-build-"));
    const buildHome = path.join(scratch, "home");
    const buildTmp = path.join(scratch, "tmp");

    try {
        await fs.promises.mkdir(path.dirname(outputDir), { recursive: true });
        await fs.promises.mkdir(buildHome);
        await fs.promises.mkdir(buildTmp);
        await retry(() => $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npm ci`);

        if (fs.existsSync("Herebyfile.mjs")) {
            if (isCorsa) {
                await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npx hereby build`;
                if (buildApi) {
                    await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npx hereby typescript:build-main`;
                    await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npx hereby typescript:build-platform --platform ${`${process.platform}-${process.arch}`}`;
                }
                await moveBuildOutput("built/local", outputDir, sourceDir);
                if (buildApi) await preserveApiArtifact(outputDir, commit);
            }
            else {
                await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npx hereby lkg`;
                await moveBuildOutput("lib", outputDir, sourceDir);
            }
        }
        else {
            await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} npm run build:compiler`;
            await moveBuildOutput("built/local", outputDir, sourceDir);
        }
    }
    finally {
        await removeScratch(scratch);
    }

    await $`git -c core.hooksPath=/dev/null -c core.fsmonitor=false clean -fddx`;
    await $`git -c core.hooksPath=/dev/null -c core.fsmonitor=false reset --hard HEAD`;

    let branch: string | undefined;

    const isPR = parseBoolean(getNonEmptyEnv("IS_PR"), false);
    const ref = getNonEmptyEnv("REF");
    const isCustomCommitRange = parseBoolean(getNonEmptyEnv("TSPERF_IS_CUSTOM_COMMIT_RANGE"), false);

    // If this is a custom commit range, don't bother trying to figure out what the branch names are.
    if (!isCustomCommitRange) {
        if (isPR) {
            // This is a PR run. Pull the branch info from the PR.
            const prefix = "refs/pull/";
            assert(ref.startsWith(prefix), `Expected ref to start with ${prefix}, instead got ${ref}`);

            if (args.baseline) {
                const prNumber = ref.slice(prefix.length).split("/")[0];

                const octokit = new Octokit();
                const pr = await octokit.rest.pulls.get({
                    owner: "microsoft",
                    repo: getNonEmptyEnv("REPO"),
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

    await fs.promises.writeFile(args.variablesFile, JSON.stringify({ TYPESCRIPT_COMMIT: commit }), { flag: "wx" });
}

if (esMain(import.meta)) {
    await main().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
