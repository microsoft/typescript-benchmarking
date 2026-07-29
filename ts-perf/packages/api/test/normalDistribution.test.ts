import { describe, expect, test } from "vitest";

import { standardNormalCdf } from "../src/normalDistribution.js";
import { utest } from "../src/utest.js";

describe("standardNormalCdf", () => {
    test.each([
        [-10, 7.619853024160593e-24],
        [-8, 6.220960574271819e-16],
        [-6, 9.865876450377014e-10],
        [-4, 0.000031671241833119965],
        [-2, 0.02275013194817922],
        [-1, 0.15865525393145707],
        [-0.5, 0.30853753872598694],
        [0, 0.5],
        [0.5, 0.6914624612740131],
        [1, 0.8413447460685429],
        [2, 0.9772498680518208],
        [4, 0.9999683287581669],
        [6, 0.9999999990134123],
        [8, 0.9999999999999993],
        [10, 1],
    ])("returns the expected value at %d", (value, expected) => {
        expect(standardNormalCdf(value)).toBeCloseTo(expected, 15);
    });

    test("handles special values", () => {
        expect(standardNormalCdf(Number.NEGATIVE_INFINITY)).toBe(0);
        expect(standardNormalCdf(Number.POSITIVE_INFINITY)).toBe(1);
        expect(standardNormalCdf(Number.NaN)).toBeNaN();
    });
});

describe("utest", () => {
    test.each([
        [[1, 2, 3], [1, 2, 3], 1],
        [[1, 2, 3], [4, 5, 6], 0.0808555983700523],
        [[1, 1, 2, 3], [1, 2, 2, 4], 0.6489418131874136],
        [[10, 11, 12, 13, 14], [1, 2, 3, 4, 5], 0.0121857803553449],
        [[1, 2, 4, 8, 16], [2, 3, 5, 7, 11], 0.9165626446795412],
    ])("preserves Mann-Whitney p-values", (left, right, expected) => {
        expect(utest(left, right)).toBeCloseTo(expected, 15);
    });
});
