import * as os from "node:os";

import * as semver from "semver";

export class Comparer<T> {
    public static readonly default = new Comparer();

    public compare(x: T, y: T): number {
        if (x === y) return 0;
        if (!x) return -1;
        if (!y) return +1;
        return (x < y ? -1 : x > y ? +1 : 0);
    }

    public equals(x: T, y: T) {
        return x === y;
    }

    public static compare<T>(x: T, y: T) {
        return this.default.compare(x, y);
    }

    public static equals<T>(x: T, y: T) {
        return this.default.equals(x, y);
    }
}

export class StringComparer extends Comparer<string> {
    public static readonly caseSensitive = new StringComparer(
        /*locale*/ undefined,
        /*ignoreCase*/ false,
        /*numeric*/ false,
    );
    public static readonly caseInsensitive = new StringComparer(
        /*locale*/ undefined,
        /*ignoreCase*/ true,
        /*numeric*/ false,
    );
    public static readonly caseSensitiveNumeric = new StringComparer(
        /*locale*/ undefined,
        /*ignoreCase*/ false,
        /*numeric*/ true,
    );
    public static readonly caseInsensitiveNumeric = new StringComparer(
        /*locale*/ undefined,
        /*ignoreCase*/ true,
        /*numeric*/ true,
    );
    public static readonly fileSystem = os.platform() === "win32" ? StringComparer.caseInsensitiveNumeric
        : StringComparer.caseSensitiveNumeric;
    public static readonly default = StringComparer.caseSensitive;

    private _relationalCollator: Intl.Collator;
    private _equalityCollator: Intl.Collator;

    constructor(locale?: string | string[], ignoreCase?: boolean, numeric?: boolean) {
        super();
        this._relationalCollator = new Intl.Collator(locale as any, {
            usage: "sort",
            sensitivity: ignoreCase ? "accent" : "variant",
            numeric,
        });
        this._equalityCollator = new Intl.Collator(locale as any, {
            usage: "search",
            sensitivity: ignoreCase ? "accent" : "variant",
            numeric,
        });
    }

    public compare(x: string, y: string): number;
    public compare(x: string | undefined | null, y: string | undefined | null): number;
    public compare(x: string | undefined | null, y: string | undefined | null) {
        if (x === y) return 0;
        if (!x) return -1;
        if (!y) return +1;
        return this._relationalCollator.compare(x, y);
    }

    public equals(x: string, y: string): boolean;
    public equals(x: string | undefined | null, y: string | undefined | null): boolean;
    public equals(x: string | undefined | null, y: string | undefined | null) {
        if (x === y) return true;
        if (!x) return false;
        if (!y) return false;
        return this._equalityCollator.compare(x, y) === 0;
    }

    public static compareStrings(x: string | undefined | null, y: string | undefined | null, ignoreCase?: boolean) {
        return (ignoreCase ? this.caseInsensitive : this.caseSensitive).compare(x, y);
    }

    public static equalsStrings(x: string | undefined | null, y: string | undefined | null, ignoreCase?: boolean) {
        return (ignoreCase ? this.caseInsensitive : this.caseSensitive).equals(x, y);
    }
}

export class VersionComparer extends Comparer<string> {
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
