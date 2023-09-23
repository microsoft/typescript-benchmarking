import cdf from "@stdlib/stats-base-dists-normal-cdf";

// This function returns the p-value determined by the two-sided Mann-Whitney U-Test,
// via the normal approximation.
// Emperically, its behavior matches scipy's scipy.stats.mannwhitneyu function (though
// implemented differently).
// https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test
// https://sphweb.bumc.bu.edu/otlt/mph-modules/bs/bs704_nonparametric/bs704_nonparametric4.html
export function utest(x1: readonly number[], x2: readonly number[]): number {
    function toLabeled(x: readonly number[], label: "x1" | "x2") {
        return x.map(x => ({ x, label }));
    }

    const all = toLabeled(x1, "x1").concat(toLabeled(x2, "x2")).sort((a, b) => a.x - b.x);

    const rankSums = { x1: 0, x2: 0 };
    // This is Σ_j (t_j³ - t_j) in https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test#Normal_approximation_and_tie_correction
    let tieCorrection = 0;

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
        if (t > 1) {
            tieCorrection += t * t * t - t;
        }
    }

    const n1 = x1.length;
    const n2 = x2.length;
    const n = n1 + n2;

    const R1 = rankSums.x1;
    const U1 = n1 * n2 + (n1 * (n1 + 1)) / 2 - R1;
    const U2 = n1 * n2 - U1; // Simplified, as n1*n2 = U1 + U2.
    const U = Math.max(U1, U2);

    const m_U = n1 * n2 / 2;
    const sigma_U = Math.sqrt(((n1 * n2) / 12) * ((n + 1) - tieCorrection / (n * (n - 1))));

    // 0.5 is the "continuity correction" (see the docs on https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html)
    const z = (U - m_U - 0.5) / sigma_U;

    let pValue = 2 * (1 - cdf(z, 0, 1)); // Multiply by 2; two-sided test.
    pValue = Math.max(0, pValue);
    pValue = Math.min(1, pValue);
    return pValue;
}
