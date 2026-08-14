import fs from "node:fs";
import path from "node:path";

export type TypeScriptImplementation = "typescript" | "tsgo";

export function detectTypeScriptImplementation(repoDir: string): TypeScriptImplementation | undefined {
    const packageJsonPath = path.join(repoDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return undefined;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    return typeof packageJson.name === "string"
        ? packageJson.name === "typescript" ? "typescript" : "tsgo"
        : undefined;
}
