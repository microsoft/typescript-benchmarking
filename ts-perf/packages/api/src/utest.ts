import { standardNormalCdf } from "./normalDistribution";
import { uDistributionCdf } from "./uDistribution";

const exactLimit = 50;
const tiesExactLimit = 25;

// This function returns the p-value determined by the two-sided Mann-Whitney U-test.
// It uses the exact distribution for small samples and a corrected normal approximation
// for larger samples, matching Go benchstat's implementation.
// https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test
export function utest(x1: readonly number[], x2: readonly number[]): number {
    if (x1.length === 0 || x2.length === 0) {
        throw new Error("Mann-Whitney U-test samples must not be empty.");
    }

    function toLabeled(x: readonly number[], label: "x1" | "x2") {
        return x.map(x => ({ x, label }));
    }

    const all = toLabeled(x1, "x1").concat(toLabeled(x2, "x2")).sort((a, b) => a.x - b.x);

    const rankSums = { x1: 0, x2: 0 };
    const ties: number[] = [];
    let hasTies = false;

    for (let i = 0; i < all.length;) {
        const curr = all[i];
        i++;

        const rankCounts = { x1: 0, x2: 0 };
        rankCounts[curr.label]++;

        // Find ties
        const firstRank = i;
        while (i < all.length) {
            const next = all[i];
            if (next.x !== curr.x) {
                break;
            }

            rankCounts[next.label]++;
            i++;
        }
        const lastRank = i;

        const rank = (lastRank + firstRank) / 2;
        rankSums.x1 += rankCounts.x1 * rank;
        rankSums.x2 += rankCounts.x2 * rank;

        const t = lastRank - firstRank + 1;
        ties.push(t);
        hasTies ||= t > 1;
    }

    const n1 = x1.length;
    const n2 = x2.length;
    const n = n1 + n2;

    const R1 = rankSums.x1;
    const U1 = R1 - (n1 * (n1 + 1)) / 2;
    const U2 = n1 * n2 - U1; // Simplified, as n1*n2 = U1 + U2.
    const smallerU = Math.min(U1, U2);

    const useExactDistribution = (!hasTies && n1 <= exactLimit && n2 <= exactLimit)
        || (hasTies && n1 <= tiesExactLimit && n2 <= tiesExactLimit);
    if (useExactDistribution) {
        if (ties.length === 1) {
            return 1;
        }

        if (U1 === U2) {
            return 1;
        }
        return Math.min(1, 2 * uDistributionCdf(n1, n2, ties, smallerU));
    }

    // This is Σ_j (t_j³ - t_j) in the normal approximation's tie correction.
    const tieCorrection = ties.reduce((total, tie) => total + tie * tie * tie - tie, 0);
    const meanU = n1 * n2 / 2;
    const sigmaU = Math.sqrt(((n1 * n2) / 12) * ((n + 1) - tieCorrection / (n * (n - 1))));
    if (sigmaU === 0) {
        return 1;
    }

    const numerator = U1 - meanU - Math.sign(U1 - meanU) * 0.5;
    const z = numerator / sigmaU;
    return Math.min(1, 2 * Math.min(standardNormalCdf(z), 1 - standardNormalCdf(z)));
}
