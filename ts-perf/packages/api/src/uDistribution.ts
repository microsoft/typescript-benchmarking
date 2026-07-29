// Adapted from Go's golang.org/x/perf/internal/stats U distribution implementation.

interface UEntry {
    n1: number;
    twoU: number;
    value: number;
}

function choose(n: number, k: number): number {
    if (k < 0 || k > n) {
        return 0;
    }

    k = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= k; i++) {
        result = (result * (n - k + i)) / i;
    }
    return result;
}

function probabilityMasses(n1: number, n2: number, maxU: number): Float64Array {
    let n = n1;
    let m = n2;
    if (n > m) {
        [n, m] = [m, n];
    }

    const memo = Array.from({ length: n + 1 }, () => new Float64Array(maxU + 1));
    for (let currentM = 0; currentM <= m; currentM++) {
        memo[0][0] = 1;

        const nLimit = Math.min(n, currentM);
        for (let currentN = 1; currentN <= nLimit; currentN++) {
            const left = memo[currentN - 1];
            const right = currentN <= currentM - 1 ? memo[currentN] : memo[currentM - 1];
            const output = memo[currentN];
            const uLimit = Math.min(maxU, currentN * currentM);

            for (let u = uLimit; u >= 0; u--) {
                const leftProbability = u >= currentM ? currentN * left[u - currentM] : 0;
                const rightProbability = currentM * right[u];
                output[u] = (leftProbability + rightProbability) / (currentN + currentM);
            }
        }
    }

    return memo[n];
}

function untiedCdf(n1: number, n2: number, u: number): number {
    if (u < 0) {
        return 0;
    }

    const maxU = n1 * n2;
    if (u >= maxU) {
        return 1;
    }

    let integerU = Math.floor(u);
    const flip = integerU >= Math.floor((maxU + 1) / 2);
    if (flip) {
        integerU = maxU - integerU - 1;
    }

    const probabilities = probabilityMasses(n1, n2, integerU);
    let probability = 0;
    for (let i = 0; i <= integerU; i++) {
        probability += probabilities[i];
    }
    return flip ? 1 - probability : probability;
}

function entryKey(n1: number, twoU: number): string {
    return `${n1},${twoU}`;
}

function setEntry(entries: Map<string, UEntry>, n1: number, twoU: number, value: number): void {
    entries.set(entryKey(n1, twoU), { n1, twoU, value });
}

function sum(values: readonly number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

function twoUMin(
    n1: number,
    ties: readonly number[],
    tieCount: number,
    coefficients: readonly number[],
): number {
    let twoU = -n1 * n1;
    let remaining = n1;
    for (let k = 1; k <= tieCount; k++) {
        const count = Math.min(remaining, ties[k - 1]);
        twoU += count * coefficients[k];
        remaining -= count;
    }
    return twoU;
}

function twoUMax(
    n1: number,
    ties: readonly number[],
    tieCount: number,
    coefficients: readonly number[],
): number {
    let twoU = -n1 * n1;
    let remaining = n1;
    for (let k = tieCount; k > 0; k--) {
        const count = Math.min(remaining, ties[k - 1]);
        twoU += count * coefficients[k];
        remaining -= count;
    }
    return twoU;
}

function tiedCumulativeCount(twoU: number, n1: number, ties: readonly number[]): number {
    const rankCount = ties.length;
    const coefficients = Array.from<number>({ length: rankCount + 1 }).fill(0);
    coefficients[1] = ties[0];
    for (let k = 2; k <= rankCount; k++) {
        coefficients[k] = coefficients[k - 1] + ties[k - 2] + ties[k - 1];
    }

    const memo = Array.from({ length: rankCount + 1 }, () => new Map<string, UEntry>());
    setEntry(memo[rankCount], n1, twoU, 0);

    let tieSum = sum(ties);
    for (let k = rankCount - 1; k >= 2; k--) {
        tieSum -= ties[k];
        for (const next of memo[k + 1].values()) {
            const rankLow = Math.max(0, next.n1 - tieSum);
            const rankHigh = Math.min(next.n1, ties[k]);
            for (let rank = rankLow; rank <= rankHigh; rank++) {
                const previousTwoU = next.twoU - rank * (coefficients[k + 1] - 2 * next.n1 + rank);
                const previousN1 = next.n1 - rank;
                if (
                    twoUMin(previousN1, ties, k, coefficients) <= previousTwoU
                    && previousTwoU <= twoUMax(previousN1, ties, k, coefficients)
                ) {
                    setEntry(memo[k], previousN1, previousTwoU, 0);
                }
            }
        }
    }

    const firstTwoRanks = ties[0] + ties[1];
    for (const entry of memo[2].values()) {
        let cumulativeCount = 0;
        const rankLow = Math.max(0, entry.n1 - ties[0]);
        const rankHigh = Math.trunc((entry.twoU - entry.n1 * (ties[0] - entry.n1)) / firstTwoRanks);
        for (let rank = rankLow; rank <= rankHigh; rank++) {
            cumulativeCount += choose(ties[0], entry.n1 - rank) * choose(ties[1], rank);
        }
        entry.value = cumulativeCount;
    }

    tieSum = ties[0];
    for (let k = 3; k <= rankCount; k++) {
        tieSum += ties[k - 2];
        for (const entry of memo[k].values()) {
            let cumulativeCount = 0;
            const rankLow = Math.max(0, entry.n1 - tieSum);
            const rankHigh = Math.min(entry.n1, ties[k - 1]);
            for (let rank = rankLow; rank <= rankHigh; rank++) {
                const previousTwoU = entry.twoU - rank * (coefficients[k] - 2 * entry.n1 + rank);
                const previousN1 = entry.n1 - rank;
                const previous = memo[k - 1].get(entryKey(previousN1, previousTwoU));
                let count = previous?.value ?? 0;
                if (!previous && twoUMax(previousN1, ties, k - 1, coefficients) < previousTwoU) {
                    count = choose(tieSum, previousN1);
                }
                cumulativeCount += count * choose(ties[k - 1], rank);
            }
            entry.value = cumulativeCount;
        }
    }

    const result = memo[rankCount].get(entryKey(n1, twoU));
    if (!result) {
        throw new Error("Failed to compute the exact Mann-Whitney U distribution.");
    }
    return result.value;
}

function tiedCdf(n1: number, n2: number, ties: readonly number[], u: number): number {
    if (u < 0) {
        return 0;
    }
    if (u >= n1 * n2) {
        return 1;
    }

    const twoU = Math.trunc(2 * u);
    return tiedCumulativeCount(twoU, n1, ties) / choose(n1 + n2, n1);
}

export function uDistributionCdf(
    n1: number,
    n2: number,
    ties: readonly number[],
    u: number,
): number {
    return ties.some(tie => tie > 1) ? tiedCdf(n1, n2, ties, u) : untiedCdf(n1, n2, u);
}
