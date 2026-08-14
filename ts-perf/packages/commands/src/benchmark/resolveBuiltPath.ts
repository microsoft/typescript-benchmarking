import * as fs from "node:fs";
import * as path from "node:path";

export function resolveBuiltPath(builtDir: string, name: string): string {
    const jsPath = path.join(builtDir, `${name}.js`);
    if (fs.existsSync(jsPath)) {
        return jsPath;
    }

    const nativeNames = name === "tsc" ? ["tsc", "tsgo"] : name === "tsgo" ? ["tsgo", "tsc"] : [name];
    for (const nativeName of nativeNames) {
        const candidates = [nativeName, `${nativeName}.exe`];
        const candidate = candidates.find(candidate => fs.existsSync(path.join(builtDir, candidate)));
        if (!candidate) {
            continue;
        }
        return path.join(builtDir, candidate);
    }
    return "";
}
