import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export async function verifyArtifact(builtDir) {
    const apiDir = path.resolve(builtDir, "api");
    const info = JSON.parse(await fs.readFile(path.join(builtDir, "info.json"), "utf8"));
    assert.match(info.commit, /^[a-f0-9]{40}$/);
    const packageDir = path.join(apiDir, "node_modules/typescript");
    const pkg = JSON.parse(await fs.readFile(path.join(packageDir, "package.json"), "utf8"));
    assert.equal(pkg.gitHead, info.commit, "Wrong JS wrapper commit");
    const platformDir = path.join(apiDir, "node_modules/@typescript", `typescript-${process.platform}-${process.arch}`);
    const native = JSON.parse(await fs.readFile(path.join(platformDir, "package.json"), "utf8"));
    assert.equal(native.gitHead, info.commit, "Wrong native compiler commit");
    const { default: getExePath } = await import(pathToFileURL(path.join(packageDir, "lib/getExePath.js")).href);
    assert.equal(
        await fs.realpath(getExePath()),
        await fs.realpath(path.join(platformDir, "lib", process.platform === "win32" ? "tsc.exe" : "tsc")),
        "Registry binary fallback",
    );
    await fs.access(getExePath(), fs.constants.X_OK);
    return { commit: info.commit, packageDir, binary: getExePath() };
}
