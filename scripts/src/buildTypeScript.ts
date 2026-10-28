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

const sandboxScript = fileURLToPath(new URL("../buildTypeScriptSandbox.sh", import.meta.url));

export function getGoVersion(sourceDir: string) {
    const tscDir = path.join(sourceDir, "tsc");
    const tscStat = fs.lstatSync(tscDir, { throwIfNoEntry: false });
    assert(!tscStat || tscStat.isDirectory(), "Expected a regular tsc directory");
    for (const relative of ["tsc/go.mod", "go.mod"]) {
        const file = path.join(sourceDir, relative);
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (!stat) continue;
        assert(stat.isFile(), "Expected a regular compiler go.mod");
        const version = /^go[ \t]+([0-9]+\.[0-9]+)(?:\.[0-9]+)?[ \t]*(?:\/\/[^\r\n]*)?\r?$/m.exec(
            fs.readFileSync(file, "utf8"),
        )?.[1];
        assert(version, "Expected a Go version directive in compiler go.mod");
        return version;
    }
    throw new Error("Expected a go.mod for the native compiler");
}

export async function installGo(sourceDir: string, buildHome: string, buildTmp: string) {
    const version = getGoVersion(sourceDir);
    const arch = process.arch === "x64" ? "amd64" : process.arch;
    assert(process.platform === "linux" && (arch === "amd64" || arch === "arm64"), "Unsupported Go build platform");
    const url = `https://aka.ms/golang/release/latest/go${version}.linux-${arch}.tar.gz`;
    const archive = path.join(buildHome, "golang.tar.gz");
    const toolchain = path.join(buildHome, "toolchain");
    await fs.promises.mkdir(toolchain);
    await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} curl --fail --location --retry 3 --retry-all-errors --output ${archive} ${url}`;
    await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} tar -C ${toolchain} -xzf ${archive}`;
    await fs.promises.rm(archive);
    await $`bash ${sandboxScript} ${sourceDir} ${buildHome} ${buildTmp} go version`;
}

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
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tsperf-build-"));
    const buildHome = path.join(scratch, "home");
    const buildTmp = path.join(scratch, "tmp");

    try {
        await fs.promises.mkdir(path.dirname(outputDir), { recursive: true });
        await fs.promises.mkdir(buildHome);
        await fs.promises.mkdir(buildTmp);
        if (isCorsa) await installGo(sourceDir, buildHome, buildTmp);
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
