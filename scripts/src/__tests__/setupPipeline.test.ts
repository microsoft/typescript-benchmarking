import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import filenamify from "filenamify";
import { globSync } from "glob";
import { expect, test } from "vitest";

import { allPresetNames, GitParseRevResult, setupPipeline } from "../setupPipeline.js";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const snapshotDir = path.join(__dirname, "__file_snapshots__", "setupPipeline");

const allSnapshotKinds = ["matrix", "outputVariables", "compute", "error", "parameters"] as const;

function getSnapshotPath(input: string, kind: typeof allSnapshotKinds[number]) {
    return path.join(snapshotDir, filenamify(input), `${kind}.snap`);
}

const inputs = [
    ...allPresetNames,
    "default",
    "predictable=true",
    "hosts=bun@1.1.3,vscode@1.88.1",
    "this is not a preset",
    "faster commits=release-5.3...release-5.4",
    "faster commits=release-5.3..release-5.4",
    "faster commits=",
    "faster predictable host=node@18.5.1",
];

async function fakeGitRevParse(query: string): Promise<GitParseRevResult> {
    switch (query) {
        case "release-5.3...release-5.4":
            return {
                baselineCommit: "27047e3391323fa2d8987f46a4c42f5361d07926",
                baselineName: "release-5.3",
                newCommit: "6ea273cdcca99db809074d2b2d38d0e5b59ee81b",
                newName: "release-5.4",
            };
        default:
            throw new Error(`Unknown query: ${query}`);
    }
}

test.each(inputs)("setupPipeline input=%s", async input => {
    const baselining = input === "baseline";

    let result, error;
    try {
        result = await setupPipeline({
            input,
            baselining,
            isPr: !baselining,
            shouldLog: false,
            gitParseRev: fakeGitRevParse,
        });
    }
    catch (e) {
        error = e;
    }

    expect(result?.matrix).toMatchFileSnapshot(getSnapshotPath(input, "matrix"));
    expect(result?.outputVariables).toMatchFileSnapshot(getSnapshotPath(input, "outputVariables"));
    expect(result?.compute).toMatchFileSnapshot(getSnapshotPath(input, "compute"));
    expect(result?.parameters).toMatchFileSnapshot(getSnapshotPath(input, "parameters"));
    expect(error).toMatchFileSnapshot(getSnapshotPath(input, "error"));
});

function getAllExpectedSnapshots() {
    return new Set(
        allSnapshotKinds.flatMap(kind => inputs.map(input => getSnapshotPath(input, kind))),
    );
}

function getAllActualSnapshots() {
    return new Set(globSync("**/*.snap", { cwd: snapshotDir, absolute: true }));
}

// Inspired by https://github.com/microsoft/DefinitelyTyped-tools/blob/7ff7d6b212946a77e0048002297964f5b51c8714/packages/eslint-plugin/test/eslint.test.ts#L114
test("abandoned snapshots", () => {
    const expectedSnapshots = getAllExpectedSnapshots();
    const actualSnapshots = getAllActualSnapshots();
    const abandonedSnapshots = [...actualSnapshots].filter(s => !expectedSnapshots.has(s));

    if (abandonedSnapshots.length === 0) {
        return;
    }

    // https://github.com/jestjs/jest/issues/8732#issuecomment-516445064
    if ((expect.getState().snapshotState as any)._updateSnapshot === "all") {
        for (const abandoned of abandonedSnapshots) {
            fs.rmSync(abandoned);
        }
        return;
    }

    if (abandonedSnapshots.length) {
        throw new Error("Abandoned snapshots found; please update snapshots to remove them.");
    }
});
