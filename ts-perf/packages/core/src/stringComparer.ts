import * as os from "node:os";

import { Comparer, defaultEqualer, Equaler } from "@esfx/equatable";

const invariantLocale = "en-US"; // not actually an invariant culture, but we must pick one for consistency.

export class StringComparer implements Comparer<string>, Equaler<string> {
    public static readonly caseSensitive = new StringComparer(
        /*locale*/ invariantLocale,
        /*ignoreCase*/ false,
        /*numeric*/ false,
    );
    public static readonly caseInsensitive = new StringComparer(
        /*locale*/ invariantLocale,
        /*ignoreCase*/ true,
        /*numeric*/ false,
    );
    public static readonly caseSensitiveNumeric = new StringComparer(
        /*locale*/ invariantLocale,
        /*ignoreCase*/ false,
        /*numeric*/ true,
    );
    public static readonly caseInsensitiveNumeric = new StringComparer(
        /*locale*/ invariantLocale,
        /*ignoreCase*/ true,
        /*numeric*/ true,
    );
    public static readonly fileSystem = os.platform() === "win32" ? StringComparer.caseInsensitiveNumeric
        : StringComparer.caseSensitiveNumeric;
    public static readonly default = StringComparer.caseSensitive;

    private _relationalCollator: Intl.Collator;
    private _equalityCollator: Intl.Collator;

    constructor(locale?: string | string[], ignoreCase?: boolean, numeric?: boolean) {
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

    public hash(x: string): number {
        const { sensitivity } = this._equalityCollator.resolvedOptions();
        return sensitivity === "variant" || x.length === 0 ? defaultEqualer.hash(x)
            : defaultEqualer.hash(x.toUpperCase());
    }

    public static compareStrings(x: string | undefined | null, y: string | undefined | null, ignoreCase?: boolean) {
        return (ignoreCase ? this.caseInsensitive : this.caseSensitive).compare(x, y);
    }

    public static equalsStrings(x: string | undefined | null, y: string | undefined | null, ignoreCase?: boolean) {
        return (ignoreCase ? this.caseInsensitive : this.caseSensitive).equals(x, y);
    }
}
