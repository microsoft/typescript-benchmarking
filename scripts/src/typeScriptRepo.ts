import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

export type TypeScriptImplementation = "strada" | "corsa";

export function detectTypeScriptImplementation(repoDir: string): TypeScriptImplementation | undefined {
    const packageJsonPath = path.join(repoDir, "package.json");
    const stat = fs.lstatSync(packageJsonPath, { throwIfNoEntry: false });
    if (!stat) {
        return undefined;
    }
    assert(stat.isFile(), "Expected a regular compiler package.json");

    const packageJson: unknown = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    assert(
        typeof packageJson === "object" && packageJson !== null && !Array.isArray(packageJson),
        "Expected a compiler package.json object",
    );
    return "name" in packageJson && typeof packageJson.name === "string"
        ? packageJson.name === "typescript" ? "strada" : "corsa"
        : undefined;
}
