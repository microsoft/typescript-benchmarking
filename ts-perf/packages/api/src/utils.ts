import { Comparer, Equaler } from "@esfx/equatable";
import { StringComparer } from "@ts-perf/core";
import * as semver from "semver";

export class VersionComparer implements Comparer<string>, Equaler<string> {
    public static readonly default = new VersionComparer();

    public compare(x: string, y: string): number;
    public compare(x: string | null | undefined, y: string | null | undefined): number;
    public compare(x: string | null | undefined, y: string | null | undefined) {
        if (x === y) return 0;
        if (!x) return -1;
        if (!y) return +1;
        const xv = semver.validRange(x, /*loose*/ true);
        const yv = semver.validRange(y, /*loose*/ true);
        return xv && yv ? semver.compare(xv, yv) : StringComparer.caseInsensitiveNumeric.compare(x, y);
    }

    public equals(x: string, y: string): boolean;
    public equals(x: string | null | undefined, y: string | null | undefined): boolean;
    public equals(x: string | null | undefined, y: string | null | undefined) {
        if (x === y) return true;
        if (!x) return false;
        if (!y) return false;
        const xv = semver.validRange(x, /*loose*/ true);
        const yv = semver.validRange(y, /*loose*/ true);
        return xv && yv ? semver.eq(xv, yv) : StringComparer.caseInsensitiveNumeric.equals(x, y);
    }

    public hash(x: string): number {
        const v = semver.validRange(x, /*loose*/ true);
        if (!v) return 0;
        return StringComparer.caseInsensitiveNumeric.hash(x);
    }

    public satisfies(x: string | null | undefined, y: string | null | undefined) {
        if (x === y) return true;
        if (!x) return false;
        if (!y) return false;
        const xv = semver.validRange(x, /*loose*/ true);
        const yv = semver.validRange(y, /*loose*/ true);
        if (xv === "*") return true;
        return xv && yv ? semver.satisfies(xv, yv) : StringComparer.caseInsensitiveNumeric.equals(x, y);
    }
}
