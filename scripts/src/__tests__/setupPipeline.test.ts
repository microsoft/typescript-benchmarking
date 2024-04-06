import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { globSync } from "glob";
import { expect, test } from "vitest";

import { allPresetNames, setupPipeline } from "../setupPipeline.js";

const __filename = url.fileURLToPath(new URL(import.meta.url));
const __dirname = path.dirname(__filename);

const snapshotDir = path.join(__dirname, "__file_snapshots__", "setupPipeline");

const allSnapshotKinds = ["matrix", "outputVariables", "compute", "error"] as const;

function getSnapshotPath(preset: string, kind: typeof allSnapshotKinds[number]) {
    return path.join(snapshotDir, preset, `${kind}.snap`);
}

const presets = [
    ...allPresetNames,
    "unknown",
    "custom",
];

test.each(presets)("setupPipeline preset=%s", preset => {
    const baselining = preset === "baseline";

    let result, error;
    try {
        result = setupPipeline(preset, baselining);
    }
    catch (e) {
        error = e;
    }

    expect(result?.matrix).toMatchFileSnapshot(getSnapshotPath(preset, "matrix"));
    expect(result?.outputVariables).toMatchFileSnapshot(getSnapshotPath(preset, "outputVariables"));
    expect(result?.compute).toMatchFileSnapshot(getSnapshotPath(preset, "compute"));
    expect(error).toMatchFileSnapshot(getSnapshotPath(preset, "error"));
});

function getAllExpectedSnapshots() {
    return new Set(
        allSnapshotKinds.flatMap(kind => presets.map(preset => getSnapshotPath(preset, kind))),
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
