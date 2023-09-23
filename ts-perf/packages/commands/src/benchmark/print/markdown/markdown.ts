import { Html } from "../html/html";

export class Markdown {
    private _text = "";
    private _leadingNewline = false;
    private _trailingNewline = false;
    private _trailingWhitespace = "";

    constructor(text?: string) {
        if (text) this.appendRaw(text);
    }

    static escapeChar(ch: string) {
        return `&#${ch.charCodeAt(0).toString()};`;
    }

    static encode(text: string) {
        text = Html.encode(text);
        for (const ch of ["\\", "*", "_", "`", "[", "]", "#", "@", "~", ":"]) {
            text = text.replace(ch, Markdown.escapeChar(ch));
        }
        return text;
    }

    append(...values: any[]) {
        for (const value of values) {
            this.appendCore(value);
        }
        return this;
    }

    private appendCore(value: any) {
        if (value instanceof Markdown || value === null || value === undefined) {
            this.appendRaw(value);
        }
        else if (typeof value !== "string" && Symbol.iterator in Object(value)) {
            this.append(...value);
        }
        else {
            this.appendRaw(Markdown.encode(value + ""));
        }
    }

    appendRaw(...values: any[]) {
        for (const value of values) {
            this.appendRawCore(value);
        }
        return this;
    }

    private appendRawCore(value: any) {
        if (typeof value !== "string" && Symbol.iterator in Object(value)) {
            this.appendRaw(...value);
            return;
        }

        if (value === null || value === undefined) {
            return;
        }

        if (value instanceof Markdown) {
            if (!this._text) {
                this._leadingNewline = value._leadingNewline;
            }
            if (value._text) {
                if (this._trailingNewline) {
                    this._text += "\n";
                    this._trailingNewline = false;
                    this._trailingWhitespace = "";
                }
                this._text += this._trailingWhitespace + value._text;
                this._trailingWhitespace = "";
            }
            this._trailingNewline = value._trailingNewline;
            this._trailingWhitespace += value._trailingWhitespace;
            return;
        }

        const text = typeof value === "string" ? value : value + "";
        if (!text) return;

        for (const segment of matchAll(/ {2}\r?\n|\r?\n|(?:[^\r\n ]| (?! ?\r?\n))+/g, text)) {
            if (/^\r?\n$/.test(segment)) {
                if (!this._text && !this._leadingNewline) {
                    this._leadingNewline = true;
                }
                else {
                    this._trailingNewline = true;
                    this._trailingWhitespace = "";
                }
                continue;
            }
            if (this._trailingNewline) {
                this._text += "\n";
                this._trailingNewline = false;
            }
            if (/^\s+$/.test(segment) && !/^\s{2}\r?\n/.test(segment)) {
                this._trailingWhitespace += segment;
            }
            else {
                this._text += this._trailingWhitespace + segment;
                this._trailingWhitespace = "";
            }
        }
    }

    toString() {
        return this._text;
    }

    toJSON() {
        return this.toString();
    }

    valueOf() {
        return this.toString();
    }
}

function* matchAll(regexp: RegExp, text: string) {
    regexp = new RegExp(regexp, regexp.global ? regexp.flags : regexp.flags + "g");
    let match: RegExpExecArray | null;
    while (match = regexp.exec(text)) {
        yield match[0];
    }
}

export function markdown(array: TemplateStringsArray, ...args: any[]) {
    const md = new Markdown(array[0]);
    for (let i = 0; i < args.length; i++) {
        md.append(args[i]).appendRaw(array[i + 1]);
    }
    return md;
}
