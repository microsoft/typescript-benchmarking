import { expect, test } from "vitest";

import { allPresetNames, generateMatrix } from "../generateMatrix.js";

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
    expect(result).toMatchSnapshot("result");
    expect(error).toMatchSnapshot("error");
});
