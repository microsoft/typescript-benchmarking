import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";

export async function preserveApiArtifact(
    outputDir: string,
    commit: string,
    sourceDir = ".",
) {
    const platform = `${process.platform}-${process.arch}`;
    const apiDir = path.join(outputDir, "api");
    const modules = path.join(apiDir, "node_modules");
    const packageDir = path.join(modules, "typescript");
    const platformName = `typescript-${platform}`;
    await fs.cp(path.join(sourceDir, "built/npm/typescript"), packageDir, { recursive: true });
    await fs.cp(path.join(sourceDir, `built/npm/${platformName}`), path.join(modules, "@typescript", platformName), {
        recursive: true,
    });
    const packagePath = path.join(packageDir, "package.json");
    const pkg: {
        name: string;
        gitHead: string;
        exports: Record<string, unknown>;
        optionalDependencies?: Record<string, string>;
    } = JSON.parse(await fs.readFile(packagePath, "utf8"));
    assert.equal(pkg.name, "typescript", "API benchmarks require the current TypeScript package layout");
    assert.equal(pkg.gitHead, commit, "JS API package must match the compiler source commit");
    const platformPackage: { gitHead: string; } = JSON.parse(
        await fs.readFile(path.join(modules, "@typescript", platformName, "package.json"), "utf8"),
    );
    assert.equal(platformPackage.gitHead, commit, "Native package must match the compiler source commit");
    for (const [key, value] of Object.entries(pkg.exports)) {
        if (key !== "." && key !== "./package.json" && !key.startsWith("./unstable/")) {
            const alias = `./unstable/${key.slice(2)}`;
            pkg.exports[alias] ??= value;
        }
    }
    // Both packages are copied from this build; never allow an install to fetch a registry binary.
    delete pkg.optionalDependencies;
    await fs.writeFile(packagePath, JSON.stringify(pkg, undefined, 4) + "\n");
    await fs.access(
        path.join(modules, "@typescript", platformName, "lib", process.platform === "win32" ? "tsc.exe" : "tsc"),
    );
    await fs.access(path.join(packageDir, "dist/api/sync/api.js"));
    await fs.access(path.join(packageDir, "dist/api/async/api.js"));
}
