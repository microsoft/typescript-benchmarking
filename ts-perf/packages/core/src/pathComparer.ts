import * as os from "node:os";

import { Comparer, Equaler } from "@esfx/equatable";

import { StringComparer } from "./stringComparer";
import { normalizeSlashes, removeWindowsLongPathPrefix, trimTrailingDirectorySeparator } from "./utils";

export class PathComparer implements Comparer<string>, Equaler<string> {
    public static readonly caseSensitive = new PathComparer(StringComparer.caseSensitiveNumeric);
    public static readonly caseInsensitive = new PathComparer(StringComparer.caseInsensitiveNumeric);
    public static readonly fileSystem = os.platform() === "win32" ? this.caseInsensitive : this.caseSensitive;

    private _comparer: Comparer<string> & Equaler<string>;

    constructor(comparerOrIgnoreCase?: boolean | Comparer<string> & Equaler<string>) {
        this._comparer = typeof comparerOrIgnoreCase === "object" ? comparerOrIgnoreCase
            : comparerOrIgnoreCase ? StringComparer.caseInsensitiveNumeric
            : StringComparer.caseInsensitiveNumeric;
    }

    public compare(x: string, y: string): number;
    public compare(x: string | undefined | null, y: string | undefined | null): number;
    public compare(x: string | undefined | null, y: string | undefined | null) {
        if (x === y) return 0;
        if (!x) return -1;
        if (!y) return +1;

        x = normalizeSlashes(x);
        x = trimTrailingDirectorySeparator(x);
        x = removeWindowsLongPathPrefix(x);
        // DOS drives are always case insensitive
        x = /^[a-z]:/i.test(x) ? `${x.slice(0, 2).toUpperCase()}${x.slice(2)}` : x;

        y = normalizeSlashes(y);
        y = trimTrailingDirectorySeparator(y);
        y = removeWindowsLongPathPrefix(y);
        // DOS drives are always case insensitive
        y = /^[a-z]:/i.test(y) ? `${y.slice(0, 2).toUpperCase()}${y.slice(2)}` : y;

        return this._comparer.compare(x, y);
    }

    public equals(x: string, y: string): boolean;
    public equals(x: string | undefined | null, y: string | undefined | null): boolean;
    public equals(x: string | undefined | null, y: string | undefined | null) {
        if (x === y) return true;
        if (!x) return false;
        if (!y) return false;

        x = normalizeSlashes(x);
        x = trimTrailingDirectorySeparator(x);
        x = removeWindowsLongPathPrefix(x);
        // DOS drives are always case insensitive
        x = /^[a-z]:/i.test(x) ? `${x.slice(0, 2).toUpperCase()}${x.slice(2)}` : x;

        y = normalizeSlashes(y);
        y = trimTrailingDirectorySeparator(y);
        y = removeWindowsLongPathPrefix(y);
        // DOS drives are always case insensitive
        y = /^[a-z]:/i.test(y) ? `${y.slice(0, 2).toUpperCase()}${y.slice(2)}` : y;

        return this._comparer.equals(x, y);
    }

    public hash(x: string): number {
        x = normalizeSlashes(x);
        x = trimTrailingDirectorySeparator(x);
        x = removeWindowsLongPathPrefix(x);
        // DOS drives are always case insensitive
        x = /^[a-z]:/i.test(x) ? `${x.slice(0, 2).toUpperCase()}${x.slice(2)}` : x;
        return this._comparer.hash(x);
    }
}
