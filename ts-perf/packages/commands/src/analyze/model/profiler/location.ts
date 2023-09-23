import * as inspector from "@ts-perf/inspector";
import { Comparable, fn } from "iterable-query";

export class Location implements Comparable {
    readonly url: string;
    readonly lineNumber: number;
    readonly columnNumber: number;

    constructor(url: string, lineNumber = -1, columnNumber = -1) {
        this.url = url && fileURLToPath(url);
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
    }

    get inlined() {
        return !!this.url && this.lineNumber === -1 && this.columnNumber === -1;
    }

    static fromCallFrame(callFrame: inspector.CallFrame) {
        return new Location(
            callFrame.url,
            callFrame.lineNumber,
            callFrame.columnNumber,
        );
    }

    valueOf() {
        return this.toString();
    }

    toString() {
        if (this.inlined) return "<inlined>";
        let s = this.url || "program";
        if (this.url && this.lineNumber !== -1) {
            s += ":" + (this.lineNumber + 1);
            if (this.columnNumber !== -1) {
                s += ":" + (this.columnNumber + 1);
            }
        }
        return s;
    }

    [Comparable.compareTo](other: unknown) {
        if (!(other instanceof Location)) throw new TypeError();
        return fn.compare(this.url, other.url)
            || fn.compare(this.lineNumber, other.lineNumber)
            || fn.compare(this.columnNumber, other.columnNumber);
    }
}
function fileURLToPath(url: string): string {
    throw new Error("Function not implemented.");
}
