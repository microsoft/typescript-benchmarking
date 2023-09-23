import { Comparable } from "@esfx/equatable";
import { fn, from } from "iterable-query";

import { padLeft } from "./format";

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1e3;

const MICROSECONDS_PER_DAY = 86400e6;
const MICROSECONDS_PER_HOUR = 3600e6;
const MICROSECONDS_PER_MINUTE = 60e6;
const MICROSECONDS_PER_SECOND = 1e6;
const MICROSECONDS_PER_MILLISECOND = 1e3;
const NANOSECONDS_PER_MICROSECOND = 1e3;
const NANOSECONDS_PER_SECOND = 1e9;

// 1: sign
// 2: days
// 3: hours
// 4: minutes
// 5: seconds
// 6: microseconds (needs addtl. parse)
// 7: integer part
// 8: fractional part (needs addtl. parse)
// 9: unit
const timespanPattern =
    /^(?:\+|(-))?(?:(?:(\d+)[.:])?(\d+):(\d+):(\d+)(?:[,.](\d+))?|(\d+)(?:[,.](\d+))?(d|hr?|min|s|ms|μs)?|(Infinity))$/i;

export class TimeSpan implements Comparable {
    static readonly MAX_VALUE = new TimeSpan(Number.MAX_SAFE_INTEGER);
    static readonly MIN_VALUE = new TimeSpan(Number.MIN_SAFE_INTEGER);
    static readonly POSITIVE_INFINITY = new TimeSpan(Number.POSITIVE_INFINITY);
    static readonly NEGATIVE_INFINITY = new TimeSpan(Number.NEGATIVE_INFINITY);
    static readonly ZERO = new TimeSpan(0);
    static readonly NaN = new TimeSpan(NaN);

    private _value: number; // in microseconds

    constructor(value: number | [number, number]) {
        if (Array.isArray(value)) {
            let seconds = abs0(Math.trunc(value[0]));
            let nanoseconds = abs0(Math.trunc(value[1]));
            while (nanoseconds < 0) {
                seconds -= 1;
                nanoseconds += NANOSECONDS_PER_SECOND;
            }
            while (nanoseconds >= NANOSECONDS_PER_SECOND) {
                seconds += 1;
                nanoseconds -= NANOSECONDS_PER_SECOND;
            }
            value = seconds * MICROSECONDS_PER_SECOND + nanoseconds / NANOSECONDS_PER_MICROSECOND;
        }
        this._value = abs0(Math.trunc(value));
    }

    get days() {
        return Math.trunc(this._value / MICROSECONDS_PER_DAY);
    }
    get hours() {
        return Math.trunc(this._value / MICROSECONDS_PER_HOUR) % HOURS_PER_DAY;
    }
    get minutes() {
        return Math.trunc(this._value / MICROSECONDS_PER_MINUTE) % MINUTES_PER_HOUR;
    }
    get seconds() {
        return Math.trunc(this._value / MICROSECONDS_PER_SECOND) % SECONDS_PER_MINUTE;
    }
    get milliseconds() {
        return Math.trunc(this._value / MICROSECONDS_PER_MILLISECOND) % MILLISECONDS_PER_SECOND;
    }
    get microseconds() {
        return this._value % MICROSECONDS_PER_MILLISECOND;
    }
    get totalDays() {
        return this._value / MICROSECONDS_PER_DAY;
    }
    get totalHours() {
        return this._value / MICROSECONDS_PER_HOUR;
    }
    get totalMinutes() {
        return this._value / MICROSECONDS_PER_MINUTE;
    }
    get totalSeconds() {
        return this._value / MICROSECONDS_PER_SECOND;
    }
    get totalMilliseconds() {
        return this._value / MICROSECONDS_PER_MILLISECOND;
    }
    get totalMicroseconds() {
        return this._value;
    }

    static parse(text: string) {
        let value = NaN;
        const match = timespanPattern.exec(text.trim());
        if (match) {
            const [
                ,
                signPart,
                daysPart,
                hoursPart,
                minutesPart,
                secondsIntegerPart,
                secondsFractionalPart,
                valueIntegerPart,
                valueFractionalPart,
                valueUnit,
                infinity,
            ] = match;
            const negative = signPart === "-";
            if (daysPart || hoursPart || minutesPart || secondsIntegerPart || secondsFractionalPart) {
                const days = daysPart ? parseInt(daysPart, 10) : 0;
                const hours = hoursPart ? parseInt(hoursPart, 10) : 0;
                const minutes = minutesPart ? parseInt(minutesPart, 10) : 0;
                const seconds = secondsIntegerPart ? parseInt(secondsIntegerPart, 10) : 0;
                const microseconds = secondsFractionalPart
                    ? Math.trunc(parseFloat("0." + secondsFractionalPart) * MICROSECONDS_PER_SECOND) : 0;
                value = days * MICROSECONDS_PER_DAY
                    + hours * MICROSECONDS_PER_HOUR
                    + minutes * MICROSECONDS_PER_MINUTE
                    + seconds * MICROSECONDS_PER_SECOND
                    + microseconds;
            }
            else if (valueIntegerPart || valueFractionalPart || valueUnit) {
                const integerPart = valueIntegerPart ? parseInt(valueIntegerPart, 10) : 0;
                const fractionalPart = valueFractionalPart ? parseFloat("0." + valueFractionalPart) : 0;
                const unit = valueUnit ? valueUnit.toLowerCase() : "d";
                value = (integerPart + fractionalPart) * (
                    unit === "d" ? MICROSECONDS_PER_DAY
                        : unit === "h" || unit === "hr" ? MICROSECONDS_PER_HOUR
                        : unit === "min" ? MICROSECONDS_PER_MINUTE
                        : unit === "s" ? MICROSECONDS_PER_SECOND
                        : unit === "ms" ? MICROSECONDS_PER_MILLISECOND
                        : 1
                );
            }
            else if (infinity) {
                value = Infinity;
            }
            if (negative) value = -value;
        }

        if (isNaN(value)) return TimeSpan.NaN;
        if (value === Number.POSITIVE_INFINITY) return TimeSpan.POSITIVE_INFINITY;
        if (value === Number.NEGATIVE_INFINITY) return TimeSpan.NEGATIVE_INFINITY;
        if (value === Number.MAX_SAFE_INTEGER) return TimeSpan.MAX_VALUE;
        if (value === Number.MIN_SAFE_INTEGER) return TimeSpan.MIN_VALUE;
        if (value === 0) return TimeSpan.ZERO;
        return new TimeSpan(value);
    }

    static isNaN(value: TimeSpan) {
        return Number.isNaN(value._value);
    }
    static fromDays(value: number) {
        return new TimeSpan(value * MICROSECONDS_PER_DAY);
    }
    static fromHours(value: number) {
        return new TimeSpan(value * MICROSECONDS_PER_HOUR);
    }
    static fromMinutes(value: number) {
        return new TimeSpan(value * MICROSECONDS_PER_MINUTE);
    }
    static fromSeconds(value: number) {
        return new TimeSpan(value * MICROSECONDS_PER_SECOND);
    }
    static fromMilliseconds(value: number) {
        return new TimeSpan(value * MICROSECONDS_PER_MILLISECOND);
    }
    static fromMicroseconds(value: number) {
        return new TimeSpan(value);
    }
    static fromTimestamp(value: [number, number]) {
        return new TimeSpan(value);
    }
    static max(...values: TimeSpan[]): TimeSpan {
        let result = TimeSpan.NEGATIVE_INFINITY;
        for (const value of values) {
            if (value.compareTo(result) > 0) result = value;
        }
        return result;
    }
    static min(...values: TimeSpan[]): TimeSpan {
        let result = TimeSpan.POSITIVE_INFINITY;
        for (const value of values) {
            if (value.compareTo(result) < 0) result = value;
        }
        return result;
    }

    static compare(left: TimeSpan, right: TimeSpan): number {
        return isNullable(left) ? isNullable(right) ? 0 : -1
            : isNullable(right) ? 1
            : compareValues(left._value, right._value);
    }

    compareTo(other: TimeSpan): number {
        return TimeSpan.compare(this, other);
    }

    [Comparable.compareTo](other: unknown) {
        if (!(other instanceof TimeSpan)) throw new TypeError();
        return this.compareTo(other);
    }

    static equals(left: TimeSpan, right: TimeSpan): boolean {
        return left === null ? right === null : right === null ? false
            : left === undefined ? right === undefined : right === undefined ? false
            : left._value === right._value;
    }

    equals(other: TimeSpan): boolean {
        return TimeSpan.equals(this, other);
    }

    negate() {
        return new TimeSpan(-this._value);
    }

    add(other: TimeSpan) {
        return new TimeSpan(this._value + other._value);
    }

    subtract(other: TimeSpan) {
        return new TimeSpan(this._value - other._value);
    }

    scale(value: number) {
        return new TimeSpan(this._value * value);
    }

    toTimestamp(): [number, number] {
        const seconds = Math.trunc(this._value / MICROSECONDS_PER_SECOND);
        const nanoseconds = Math.trunc(this._value % MICROSECONDS_PER_SECOND * NANOSECONDS_PER_MICROSECOND);
        return [seconds, nanoseconds];
    }

    toJSON(): any {
        return this._value;
    }

    toShortString() {
        if (Math.abs(this._value) >= MICROSECONDS_PER_DAY) {
            return `${
                this.totalDays.toLocaleString("en-US", {
                    style: "decimal",
                    useGrouping: true,
                    maximumFractionDigits: 2,
                })
            } d`;
        }
        if (Math.abs(this._value) >= MICROSECONDS_PER_HOUR) {
            return `${
                this.totalHours.toLocaleString("en-US", {
                    style: "decimal",
                    useGrouping: true,
                    maximumFractionDigits: 2,
                })
            } hr`;
        }
        if (Math.abs(this._value) >= MICROSECONDS_PER_MINUTE) {
            return `${
                this.totalMinutes.toLocaleString("en-US", {
                    style: "decimal",
                    useGrouping: true,
                    maximumFractionDigits: 2,
                })
            } min`;
        }
        if (Math.abs(this._value) >= MICROSECONDS_PER_SECOND) {
            return `${
                this.totalSeconds.toLocaleString("en-US", {
                    style: "decimal",
                    useGrouping: true,
                    maximumFractionDigits: 2,
                })
            } s`;
        }
        if (Math.abs(this._value) >= MILLISECONDS_PER_SECOND) {
            return `${
                this.totalMicroseconds.toLocaleString("en-US", {
                    style: "decimal",
                    useGrouping: true,
                    maximumFractionDigits: 2,
                })
            } ms`;
        }
        return `${this.totalMicroseconds} μs`;
    }

    toLocaleString(locale?: string | string[], options?: Intl.NumberFormatOptions) {
        return this._toString(":", /*localize*/ true, locale, options);
    }

    toString() {
        return this._toString(".", /*localize*/ false);
    }

    private _toString(
        daySep: "." | ":",
        localize: boolean,
        locale?: string | string[],
        options?: Intl.NumberFormatOptions,
    ) {
        if (localize && options) {
            options = { ...options };
            options.style = "decimal";
            options.useGrouping = false;
            options.currency = undefined;
            options.currencyDisplay = undefined;
            options.minimumSignificantDigits = undefined;
            options.maximumSignificantDigits = undefined;
            options.minimumIntegerDigits = 1;
            if (options.minimumFractionDigits === undefined) options.minimumFractionDigits = 7;
            if (options.maximumFractionDigits === undefined) options.maximumFractionDigits = 7;
        }
        const value = Math.abs(this._value);
        const signPart = this._value < 0 ? "-" : "";
        const daysPart = value > MICROSECONDS_PER_DAY ? Math.trunc(value / MICROSECONDS_PER_DAY).toFixed(0) + daySep
            : "";
        const hoursPart = padLeft(Math.trunc(value / MICROSECONDS_PER_HOUR % HOURS_PER_DAY).toFixed(0), 2, "0");
        const minutesPart = padLeft(Math.trunc(value / MICROSECONDS_PER_HOUR % MINUTES_PER_HOUR).toFixed(0), 2, "0");
        const secondsPart = padLeft(
            Math.trunc(value / MICROSECONDS_PER_SECOND % SECONDS_PER_MINUTE).toFixed(0),
            2,
            "0",
        );
        const microseconds = value % MICROSECONDS_PER_SECOND / MICROSECONDS_PER_SECOND;
        let microsecondsPart = "";
        if (microseconds > 0) {
            microsecondsPart = localize ? microseconds.toLocaleString(locale, options) : microseconds.toFixed(7);
            microsecondsPart = microsecondsPart.replace(/^0+/, "");
        }
        return `${signPart}${daysPart}${hoursPart}:${minutesPart}:${secondsPart}${microsecondsPart}`;
    }

    valueOf() {
        return this._value;
    }
}

function abs0(value: number) {
    return value === 0 ? 0 : value;
}

export namespace Range {
    export type Unbounded = typeof Range.leftUnbounded | typeof Range.rightUnbounded;
}

export class Range<T> {
    public static readonly leftUnbounded = Symbol("Range.leftUnbounded");
    public static readonly rightUnbounded = Symbol("Range.rightUnbounded");
    public readonly left: T | Range.Unbounded;
    public readonly right: T | Range.Unbounded;
    public readonly isLeftClosed: boolean;
    public readonly isRightClosed: boolean;

    constructor(left: Range.Unbounded, right: T | Range.Unbounded, isLeftClosed?: boolean, isRightClosed?: boolean);
    constructor(left: T | Range.Unbounded, right: T | Range.Unbounded, isLeftClosed?: boolean, isRightClosed?: boolean);
    constructor(left: T | Range.Unbounded, right: T | Range.Unbounded, isLeftClosed = true, isRightClosed = true) {
        this.left = left;
        this.right = right;
        this.isLeftClosed = isLeftClosed && left !== Range.leftUnbounded;
        this.isRightClosed = isRightClosed && right !== Range.rightUnbounded;
    }

    static empty<T>() {
        return new Range<T>(Range.rightUnbounded, Range.leftUnbounded, false, false);
    }

    static unbounded<T>() {
        return new Range<T>(Range.leftUnbounded, Range.rightUnbounded, true, true);
    }

    static degenerate<T>(value: T) {
        return new Range(value, value, true, true);
    }

    static open<T>(left: T, right: T) {
        return new Range(left, right, false, false);
    }

    static closed<T>(left: T, right: T) {
        return new Range(left, right, true, true);
    }

    static openClosed<T>(left: T, right: T) {
        return new Range(left, right, false, true);
    }

    static openUnbounded<T>(left: T) {
        return new Range(left, Range.rightUnbounded, false, false);
    }

    static closedOpen<T>(left: T, right: T) {
        return new Range(left, right, true, false);
    }

    static closedUnbounded<T>(left: T) {
        return new Range(left, Range.rightUnbounded, true, false);
    }

    static unboundedOpen<T>(right: T) {
        return new Range(Range.leftUnbounded, right, false, false);
    }

    static unboundedClosed<T>(right: T) {
        return new Range(Range.leftUnbounded, right, false, true);
    }

    static normalize<T>(ranges: Iterable<Range<T>>) {
        // sort ranges
        const array = from(ranges)
            .where(range => !range.isEmpty)
            .orderBy(range => range.left, compareEndpoints)
            .thenBy(range => range.isLeftClosed ? 0 : 1)
            .thenBy(range => range.right, compareEndpoints)
            .thenBy(range => range.isRightClosed ? 1 : 0)
            .toArray();

        // union overlapping ranges
        for (let i = array.length - 1; i >= 1; i--) {
            const range = array[i];
            if (range.isUnbounded) {
                return [range];
            }

            for (let j = i - 1; j >= 0; j--) {
                if (array[j].overlaps(range)) {
                    array[j] = array[j].union(range);
                    array.splice(i, 1);
                    break;
                }
            }
        }

        return array;
    }

    static union<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>) {
        return Range.normalize(from(left).concat(right));
    }

    static intersect<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>) {
        const result: Range<T>[] = [];

        // include each range from left intersected with
        // each range from right
        for (const leftRange of left) {
            for (const rightRange of right) {
                if (leftRange.overlaps(rightRange)) {
                    result.push(leftRange.intersect(rightRange));
                }
            }
        }

        return Range.normalize(result);
    }

    static invert<T>(ranges: Iterable<Range<T>>): Iterable<Range<T>> {
        const array = Range.normalize(ranges);
        if (array.length === 0) return [Range.unbounded()];
        if (array.length === 1 && array[0].isUnbounded) return [];
        const inverted: Range<T>[] = [];
        if (!array[0].isLeftUnbounded) {
            inverted.push(new Range(Range.leftUnbounded, array[0].left, false, !array[0].isLeftClosed));
        }
        for (let i = 1; i < array.length; i++) {
            inverted.push(
                new Range(array[i - 1].right, array[i].left, !array[i - 1].isRightClosed, !array[i].isLeftClosed),
            );
        }
        if (!array[array.length - 1].isRightUnbounded) {
            inverted.push(
                new Range(
                    array[array.length - 1].right,
                    Range.rightUnbounded,
                    !array[array.length - 1].isRightClosed,
                    false,
                ),
            );
        }
        return inverted;
    }

    static relativeComplement<T>(left: Iterable<Range<T>>, right: Iterable<Range<T>>) {
        return Range.intersect(left, Range.invert(right));
    }

    get isEmpty() {
        const r = compareEndpoints(this.left, this.right);
        return r > 0 || r === 0 && !this.isClosed;
    }

    get isDegenerate() {
        return compareEndpoints(this.left, this.right) === 0 && this.isLeftClosed && this.isRightClosed;
    }
    get isLeftUnbounded() {
        return this.left === Range.leftUnbounded;
    }
    get isRightUnbounded() {
        return this.right === Range.rightUnbounded;
    }
    get isUnbounded() {
        return this.isLeftUnbounded && this.isRightUnbounded;
    }
    get isClosed() {
        return this.isLeftClosed && this.isRightClosed;
    }

    includes(value: Range<T> | T) {
        if (this.isEmpty) return false;
        if (this.isUnbounded) return true;
        if (value instanceof Range) {
            return ((value.isLeftClosed && this.isLeftClosed && compareEndpoints(value.left, this.left) === 0)
                || compareEndpoints(value.left, this.left) > 0)
                && ((value.isRightClosed && this.isRightClosed && compareEndpoints(value.right, this.right) === 0)
                    || compareEndpoints(value.right, this.right) < 0);
        }
        else {
            return (this.isLeftClosed ? compareEndpoints(value, this.left) >= 0
                : compareEndpoints(value, this.left) > 0)
                && (this.isRightClosed ? compareEndpoints(value, this.right) <= 0
                    : compareEndpoints(value, this.right) < 0);
        }
    }

    overlaps(other: Range<T>) {
        if (this.isEmpty || other.isEmpty) return false;
        if (this.isUnbounded || other.isUnbounded) return true;
        return ((this.isLeftClosed && other.isLeftClosed ? compareEndpoints(other.left, this.left) >= 0
            : compareEndpoints(other.left, this.left) > 0)
            && (this.isRightClosed && other.isLeftClosed ? compareEndpoints(other.left, this.right) <= 0
                : compareEndpoints(other.left, this.right) < 0))
            || ((this.isLeftClosed && other.isRightClosed ? compareEndpoints(other.right, this.left) >= 0
                : compareEndpoints(other.right, this.left) > 0)
                && (this.isRightClosed && other.isRightClosed ? compareEndpoints(other.right, this.right) <= 0
                    : compareEndpoints(other.right, this.right) < 0))
            || ((other.isLeftClosed && this.isLeftClosed ? compareEndpoints(this.left, other.left) >= 0
                : compareEndpoints(this.left, other.left) > 0)
                && (other.isRightClosed && this.isLeftClosed ? compareEndpoints(this.left, other.right) <= 0
                    : compareEndpoints(this.left, other.right) < 0))
            || ((other.isLeftClosed && this.isRightClosed ? compareEndpoints(this.right, other.left) >= 0
                : compareEndpoints(this.right, other.left) > 0)
                && (other.isRightClosed && this.isRightClosed ? compareEndpoints(this.right, other.right) <= 0
                    : compareEndpoints(this.right, other.right) < 0));
    }

    union(other: Range<T>) {
        if (this.isUnbounded || other.isEmpty) return this;
        if (this.isEmpty || other.isUnbounded) return other;

        let left: T | Range.Unbounded;
        let isLeftClosed: boolean;
        if (compareEndpoints(this.left, other.left) === 0) {
            left = this.left;
            isLeftClosed = this.isLeftClosed || other.isLeftClosed;
        }
        else if (compareEndpoints(this.left, other.left) < 0) {
            left = this.left;
            isLeftClosed = this.isLeftClosed;
        }
        else {
            left = other.left;
            isLeftClosed = other.isLeftClosed;
        }

        let right: T | Range.Unbounded;
        let isRightClosed: boolean;
        if (compareEndpoints(this.right, other.right) === 0) {
            right = this.right;
            isRightClosed = this.isRightClosed || other.isRightClosed;
        }
        else if (compareEndpoints(this.right, other.right) > 0) {
            right = this.right;
            isRightClosed = this.isRightClosed;
        }
        else {
            right = other.right;
            isRightClosed = other.isRightClosed;
        }

        if (
            compareEndpoints(left, this.left) === 0 && isLeftClosed === this.isLeftClosed
            && compareEndpoints(right, this.right) === 0 && isRightClosed === this.isRightClosed
        ) {
            return this;
        }
        else if (
            compareEndpoints(left, other.left) === 0 && isLeftClosed === other.isLeftClosed
            && compareEndpoints(right, other.right) === 0 && isRightClosed === other.isRightClosed
        ) {
            return other;
        }
        else {
            return new Range<T>(left, right, isLeftClosed, isRightClosed);
        }
    }

    intersect(other: Range<T>) {
        if (other.isUnbounded || this.isEmpty) return this;
        if (this.isUnbounded || other.isEmpty) return other;

        let left: T | Range.Unbounded;
        let isLeftClosed: boolean;
        if (compareEndpoints(this.left, other.left) === 0) {
            left = this.left;
            isLeftClosed = this.isLeftClosed || other.isLeftClosed;
        }
        else if (compareEndpoints(this.left, other.left) > 0) {
            left = this.left;
            isLeftClosed = this.isLeftClosed;
        }
        else {
            left = other.left;
            isLeftClosed = other.isLeftClosed;
        }

        let right: T | Range.Unbounded;
        let isRightClosed: boolean;
        if (compareEndpoints(this.right, other.right) === 0) {
            right = this.right;
            isRightClosed = this.isRightClosed || other.isRightClosed;
        }
        else if (compareEndpoints(this.right, other.right) < 0) {
            right = this.right;
            isRightClosed = this.isRightClosed;
        }
        else {
            right = other.right;
            isRightClosed = other.isRightClosed;
        }

        if (
            compareEndpoints(left, this.left) === 0 && isLeftClosed === this.isLeftClosed
            && compareEndpoints(right, this.right) === 0 && isRightClosed === this.isRightClosed
        ) {
            return this;
        }
        else if (
            compareEndpoints(left, other.left) === 0 && isLeftClosed === other.isLeftClosed
            && compareEndpoints(right, other.right) === 0 && isRightClosed === other.isRightClosed
        ) {
            return other;
        }
        else {
            return new Range<T>(left, right, isLeftClosed, isRightClosed);
        }
    }

    clampLeft(min: T, max: T) {
        return this.left === Range.leftUnbounded ? min
            : this.left === Range.rightUnbounded ? max
            : this.left;
    }

    clampRight(min: T, max: T) {
        return this.right === Range.leftUnbounded ? min
            : this.right === Range.rightUnbounded ? max
            : this.right;
    }

    toString() {
        if (this.isEmpty) return `{}`;
        if (compareEndpoints(this.left, this.right) === 0 && this.isLeftClosed && this.isRightClosed) {
            return `{${endpointToString(this.left)}}`;
        }
        return `${this.isLeftClosed ? `[` : `(`}${endpointToString(this.left)},${endpointToString(this.right)}${
            this.isRightClosed ? `]` : `)`
        }`;
    }
}

function compareEndpoints<T>(left: T | Range.Unbounded, right: T | Range.Unbounded) {
    return left === right ? 0
        : isNullable(left) ? isNullable(right) ? 0 : -1 : isNullable(right) ? 1
        : isLeftUnbounded(left) ? isLeftUnbounded(right) ? 0 : -1 : isLeftUnbounded(right) ? 1
        : isRightUnbounded(left) ? isRightUnbounded(right) ? 0 : 1 : isRightUnbounded(right) ? -1
        : isPrimitive(left) || isPrimitive(right) ? compareValues(left, right)
        : fn.compare(left, right);
}

function isNullable(value: any): value is null | undefined {
    return value === null
        || value === undefined;
}

function isLeftUnbounded(value: any): value is typeof Range.leftUnbounded {
    return value === Range.leftUnbounded;
}

function isRightUnbounded(value: any): value is typeof Range.rightUnbounded {
    return value === Range.rightUnbounded;
}

function isPrimitive(value: any): value is string | number | boolean {
    return typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean";
}

function compareValues(left: any, right: any) {
    return left < right ? -1
        : left > right ? 1
        : 0;
}

function endpointToString<T>(value: T | Range.Unbounded) {
    return value === Range.leftUnbounded ? "-Infinity"
        : value === Range.rightUnbounded ? "Infinity"
        : `${value}`;
}
