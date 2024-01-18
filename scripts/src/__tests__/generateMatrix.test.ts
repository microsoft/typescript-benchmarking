import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { globSync } from "glob";
import { expect, test } from "vitest";

import { allPresetNames, generateMatrix } from "../generateMatrix.js";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const snapshotDir = path.join(__dirname, "__file_snapshots__", "generateMatrix");

const allSnapshotKinds = ["matrix", "outputVariables", "compute", "error"] as const;

function getSnapshotPath(preset: string, baselining: boolean, kind: typeof allSnapshotKinds[number]) {
    return path.join(snapshotDir, preset, `${baselining ? "baselining" : "non-baselining"}.${kind}.snap`);
}

const presets = [
    ...allPresetNames,
    "unknown",
    "custom",
];

const tests = presets.flatMap<[string, boolean]>(p => [[p, false], [p, true]]);

test.each(tests)("generateMatrix preset=%s baselining=%s", (preset, baselining) => {
    let result, error;
    try {
        result = generateMatrix(preset, baselining);
    }
    catch (e) {
        error = e;
    }

    expect(result?.matrix).toMatchFileSnapshot(getSnapshotPath(preset, baselining, "matrix"));
    expect(result?.outputVariables).toMatchFileSnapshot(getSnapshotPath(preset, baselining, "outputVariables"));
    expect(result?.compute).toMatchFileSnapshot(getSnapshotPath(preset, baselining, "compute"));
    expect(error).toMatchFileSnapshot(getSnapshotPath(preset, baselining, "error"));
});

function getAllExpectedSnapshots() {
    return new Set(
        allSnapshotKinds.flatMap(kind =>
            tests.map(([preset, baselining]) => getSnapshotPath(preset, baselining, kind))
        ),
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
