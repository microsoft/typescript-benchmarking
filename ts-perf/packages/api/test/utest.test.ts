import { describe, expect, test } from "vitest";

import { uDistributionCdf } from "../src/uDistribution.js";
import { utest } from "../src/utest.js";

describe("uDistributionCdf", () => {
    test.each([
        [1, 3, 0, 0.25],
        [2, 3, 0, 0.1],
        [3, 3, 0, 0.05],
        [1, 3, 3, 1],
        [2, 3, 3, 0.6],
        [3, 3, 3, 0.35],
        [5, 5, 5, 0.07539682539682539],
    ])("matches the Mann-Whitney tables for n1=%d, n2=%d, U=%d", (n1, n2, u, expected) => {
        expect(uDistributionCdf(n1, n2, [], u)).toBeCloseTo(expected, 15);
    });

    test.each([
        [12.5, 0.003968],
        [13.5, 0.007937],
        [15, 0.02381],
        [16.5, 0.047619],
        [17.5, 0.071429],
        [18, 0.087302],
        [19, 0.134921],
        [19.5, 0.138889],
    ])("matches Klotz's tied-distribution table at %f", (rankSum, expected) => {
        const n1 = 5;
        const ties = [1, 1, 2, 1, 1, 2, 1, 1];
        const u = rankSum - n1 * n1 / 2;
        expect(uDistributionCdf(n1, 5, ties, u)).toBeCloseTo(expected, 6);
    });
});

describe("utest", () => {
    test.each([
        [[2, 1, 3, 5], [12, 11, 13, 15], 0.028571428571428577],
        [[12, 11, 13, 15], [2, 1, 3, 5], 0.028571428571428577],
        [[2, 1, 3, 5], [0, 4, 6, 7], 0.48571428571428577],
        [[2, 1, 3, 5], [2, 1, 3, 5], 1],
        [[2, 1, 3, 5], [2, 2, 2, 2], 0.7142857142857143],
        [[2, 1, 3, 5], [1, 1, 1, 1, 1], 0],
    ])("matches benchstat's exact p-value for %#", (left, right, expected) => {
        expect(utest(left, right)).toBeCloseTo(expected, 15);
    });

    test("matches benchstat's normal approximation without ties", () => {
        const left = Array.from({ length: 500 }, (_, i) => i * 2);
        const right = Array.from({ length: 600 }, (_, i) => i * 2 - 41);
        expect(utest(left, right)).toBeCloseTo(0.0049335360814172224, 15);
    });

    test("matches benchstat's normal approximation with ties", () => {
        const left = Array.from({ length: 500 }, (_, i) => i * 2);
        const right = Array.from({ length: 600 }, (_, i) => i * 2 - 41);
        for (let i = 0; i < 30; i++) {
            right[i] = left[i];
        }
        expect(utest(left, right)).toBeCloseTo(0.0038703814239617884, 15);
    });

    test("rejects empty samples", () => {
        expect(() => utest([], [1])).toThrow("must not be empty");
        expect(() => utest([1], [])).toThrow("must not be empty");
    });

    test("treats samples where all values are equal as non-significant", () => {
        expect(utest([2, 2, 2, 2], [2, 2, 2, 2])).toBe(1);
        expect(utest(Array(26).fill(2), Array(26).fill(2))).toBe(1);
    });
});
