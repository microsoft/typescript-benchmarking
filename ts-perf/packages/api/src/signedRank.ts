import { standardNormalCdf } from "./normalDistribution";

const exactLimit = 50;

// Returns the Hodges-Lehmann estimate of the center of x: the median of the averages of all pairs
// x[i] and x[j] with i <= j. Unlike the mean, it is barely moved by a few outliers.
// https://en.wikipedia.org/wiki/Hodges%E2%80%93Lehmann_estimator
export function hodgesLehmann(x: readonly number[]): number {
    if (x.length === 0) {
        throw new Error("Hodges-Lehmann samples must not be empty.");
    }
    const averages: number[] = [];
    for (let i = 0; i < x.length; i++) {
        for (let j = i; j < x.length; j++) {
            averages.push((x[i] + x[j]) / 2);
        }
    }
    averages.sort((a, b) => a - b);
    const middle = averages.length >> 1;
    return averages.length % 2 ? averages[middle] : (averages[middle - 1] + averages[middle]) / 2;
}

// Returns the p-value of the two-sided Wilcoxon signed-rank test that x is centered on zero.
// Zeros are dropped. It uses the exact distribution for small samples without ties and a
// tie-corrected normal approximation otherwise.
// https://en.wikipedia.org/wiki/Wilcoxon_signed-rank_test
export function signedRankTest(x: readonly number[]): number {
    const nonzero = x.filter(x => x !== 0).sort((a, b) => Math.abs(a) - Math.abs(b));
    const n = nonzero.length;
    if (n === 0) {
        return 1;
    }

    let positiveRankSum = 0;
    let tieCorrection = 0;
    for (let i = 0; i < n;) {
        let j = i + 1;
        while (j < n && Math.abs(nonzero[j]) === Math.abs(nonzero[i])) {
            j++;
        }
        const rank = (i + 1 + j) / 2;
        for (let k = i; k < j; k++) {
            if (nonzero[k] > 0) {
                positiveRankSum += rank;
            }
        }
        const t = j - i;
        tieCorrection += t * t * t - t;
        i = j;
    }

    const total = n * (n + 1) / 2;
    const smaller = Math.min(positiveRankSum, total - positiveRankSum);

    if (tieCorrection === 0 && n <= exactLimit) {
        // counts[s] is the number of subsets of the ranks 1..n that sum to s.
        const counts = new Array<number>(total + 1).fill(0);
        counts[0] = 1;
        for (let rank = 1; rank <= n; rank++) {
            for (let s = total; s >= rank; s--) {
                counts[s] += counts[s - rank];
            }
        }
        let tail = 0;
        for (let s = 0; s <= smaller; s++) {
            tail += counts[s];
        }
        return Math.min(1, 2 * tail / 2 ** n);
    }

    const mean = total / 2;
    const sigma = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieCorrection / 48);
    if (sigma === 0) {
        return 1;
    }
    const z = (smaller - mean + 0.5) / sigma;
    return Math.min(1, 2 * standardNormalCdf(z));
}
