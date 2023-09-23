export function html(array: TemplateStringsArray, ...args: any[]) {
    const html = new Html(array[0]);
    for (let i = 0; i < args.length; i++) {
        html.append(args[i])
            .appendRaw(array[i + 1]);
    }
    return html;
}

export class Html {
    protected text = "";
    constructor(text: string) {
        this.appendRaw(text);
    }
    static encode(text: string) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quote;")
            .replace(/'/g, "&apos;");
    }
    protected encodeCore(text: string) {
        return Html.encode(text);
    }
    append(...values: any[]) {
        for (const value of values) {
            this.appendCore(value);
        }
        return this;
    }
    protected appendCore(value: any) {
        if (value instanceof Html) {
            this.appendRaw(value.toString());
        }
        else if (Object(value) === value && Symbol.iterator in value) {
            this.append(...value);
        }
        else if (value === null || value === undefined) {
            this.appendRaw(value);
        }
        else {
            this.appendRaw(this.encodeCore(String(value)));
        }
    }
    appendRaw(...values: any[]) {
        for (const value of values) {
            this.appendRawCore(value);
        }
        return this;
    }
    protected appendRawCore(value: any) {
        if (value !== null && value !== undefined) {
            this.text += value + "";
        }
    }
    protected wrap(text: string) {
        return new Html(text);
    }
    trim() {
        return this.wrap(this.text.trim().replace(/(\r\n?|\n)\s*(\r\n?|\n)/g, "$1"));
    }
    trimLines() {
        return this.wrap(
            this.text
                .split(/\r?\n/g)
                .map(s => s.trim())
                .filter(s => s.length > 0)
                .join("\n"),
        );
    }
    toString() {
        return this.text;
    }
    valueOf() {
        return this.toString();
    }
    toJSON() {
        return this.toString();
    }
}

export class ClassNames {
    private _classNames: string[];
    constructor(...classNames: string[]) {
        this._classNames = classNames;
    }
    public get classNames(): readonly string[] {
        return this._classNames.slice();
    }
    public add(...classNames: string[]) {
        for (const className of classNames) {
            this._classNames.push(className);
        }
        return this;
    }
    public addIf(test: boolean, ...classNames: string[]) {
        if (test) {
            this.add(...classNames);
        }
        return this;
    }
    public addRange(value: number, ranges: { [className: string]: Range; }) {
        for (const className of Object.keys(ranges)) {
            const range = ranges[className];
            if (range.includes(value)) {
                return this.add(...className.split(/\s+/g));
            }
        }
        return this;
    }
    public addRangeIf(test: boolean, value: number, ranges: { [className: string]: Range; }) {
        if (test) {
            this.addRange(value, ranges);
        }
        return this;
    }
    public toString() {
        return this._classNames.join(" ");
    }
}

export class Range {
    public readonly minValue: number;
    public readonly maxValue: number;
    constructor(minValue: number, maxValue: number) {
        this.minValue = minValue;
        this.maxValue = maxValue;
    }
    includes(value: number) {
        return this.minValue <= value
            && this.maxValue >= value;
    }
    static before(value: number) {
        return new Range(-Infinity, value);
    }
    static after(value: number) {
        return new Range(value, +Infinity);
    }
    static between(minValue: number, maxValue: number) {
        return new Range(minValue, maxValue);
    }
    static any() {
        return new Range(-Infinity, +Infinity);
    }
    static empty() {
        return new Range(NaN, NaN);
    }
}
