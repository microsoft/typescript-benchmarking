import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { preserveApiArtifact } from "../apiArtifact.js";

const temporaryDirectories: string[] = [];
const commit = "a".repeat(40);
const platformName = `typescript-${process.platform}-${process.arch}`;
const exe = `tsc${process.platform === "win32" ? ".exe" : ""}`;
const verifyModule = new URL("../../../cases/api/artifact.mjs", import.meta.url).href;

afterEach(async () => {
    await Promise.all(
        temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
    );
});

async function fixture(
    options?: { missingBinary?: boolean; wrongWrapper?: boolean; wrongBinary?: boolean; fallback?: boolean; },
) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-artifact-test-"));
    temporaryDirectories.push(root);
    const source = path.join(root, "source");
    const output = path.join(root, "output");
    const pkg = path.join(source, "built/npm/typescript");
    const platform = path.join(source, "built/npm", platformName);
    for (const directory of ["lib", "dist/api/sync", "dist/api/async"]) {
        await fs.mkdir(path.join(pkg, directory), { recursive: true });
    }
    await fs.mkdir(path.join(platform, "lib"), { recursive: true });
    await fs.writeFile(
        path.join(pkg, "package.json"),
        JSON.stringify({
            name: "typescript",
            type: "module",
            gitHead: options?.wrongWrapper ? "b".repeat(40) : commit,
            optionalDependencies: { [`@typescript/${platformName}`]: "7.1.0" },
            exports: {
                "./sync": { default: "./dist/api/sync/api.js" },
                "./async": { default: "./dist/api/async/api.js" },
                "./ast/is": "./dist/ast/is.js",
            },
        }),
    );
    await fs.writeFile(
        path.join(platform, "package.json"),
        JSON.stringify({
            gitHead: options?.wrongBinary ? "b".repeat(40) : commit,
        }),
    );
    const binary = path.join(platform, "lib", exe);
    if (!options?.missingBinary) {
        await fs.writeFile(binary, "fake-native-binary\n");
        await fs.chmod(binary, 0o755);
    }
    await fs.writeFile(path.join(pkg, "dist/api/sync/api.js"), "export const sync = true;\n");
    await fs.writeFile(path.join(pkg, "dist/api/async/api.js"), "export const async = true;\n");
    await fs.writeFile(
        path.join(pkg, "lib/getExePath.js"),
        options?.fallback
            ? "export default () => process.execPath;\n"
            : `import { fileURLToPath } from "node:url"; export default () => fileURLToPath(new URL("../../@typescript/${platformName}/lib/${exe}", import.meta.url));\n`,
    );
    return {
        source,
        output,
        async preserve() {
            await preserveApiArtifact(output, commit, source);
            await fs.writeFile(path.join(output, "info.json"), JSON.stringify({ commit }));
        },
        async verify() {
            const { verifyArtifact } = await import(verifyModule);
            return verifyArtifact(output);
        },
    };
}

test("preserves matching wrapper/binary and adds local export aliases", async () => {
    const f = await fixture();
    await f.preserve();
    const verified = await f.verify();
    expect(verified.commit).toBe(commit);
    const pkg = JSON.parse(await fs.readFile(path.join(verified.packageDir, "package.json"), "utf8"));
    expect(pkg.exports["./unstable/sync"]).toEqual(pkg.exports["./sync"]);
    expect(pkg.exports["./unstable/ast/is"]).toEqual(pkg.exports["./ast/is"]);
    expect(pkg.optionalDependencies).toBeUndefined();
    expect(await fs.readFile(verified.binary, "utf8")).toBe("fake-native-binary\n");
});

test.each([{ wrongWrapper: true }, { wrongBinary: true }, { missingBinary: true }])(
    "rejects mismatched or missing artifacts: %j",
    async options => {
        const f = await fixture(options);
        await expect(f.preserve()).rejects.toThrow();
    },
);

test("rejects registry binary fallback", async () => {
    const f = await fixture({ fallback: true });
    await f.preserve();
    await expect(f.verify()).rejects.toThrow("Registry binary fallback");
});

test("rejects a missing packaged native binary", async () => {
    const f = await fixture();
    await f.preserve();
    await fs.unlink(path.join(f.output, "api/node_modules/@typescript", platformName, "lib", exe));
    await expect(f.verify()).rejects.toThrow();
});

test("rejects missing packaged artifacts", async () => {
    const f = await fixture();
    await expect(f.verify()).rejects.toThrow();
});

test("rejects different compiler identities", async () => {
    const f = await fixture();
    await f.preserve();
    await fs.writeFile(path.join(f.output, "info.json"), JSON.stringify({ commit: "b".repeat(40) }));
    await expect(f.verify()).rejects.toThrow("Wrong JS wrapper commit");
});

test("rejects a different native package identity after packaging", async () => {
    const f = await fixture();
    await f.preserve();
    await fs.writeFile(
        path.join(f.output, "api/node_modules/@typescript", platformName, "package.json"),
        JSON.stringify({ gitHead: "b".repeat(40) }),
    );
    await expect(f.verify()).rejects.toThrow("Wrong native compiler commit");
});

test.each(["finding", "invocation failure", "parser failure", "unexpected status", "unexpected success"])(
    "ESLint distinguishes expected diagnostics from %s",
    async outcome => {
        const f = await fixture();
        await f.preserve();
        const { packageDir } = await f.verify();
        const checkout = path.join(f.source, "eslint");
        const consumer = path.join(checkout, "packages/typescript-estree");
        const workDir = path.join(checkout, "fixture");
        await fs.mkdir(path.join(consumer, "node_modules/@typescript"), { recursive: true });
        await fs.mkdir(workDir);
        await fs.symlink(packageDir, path.join(consumer, "node_modules/@typescript/native"), "junction");
        const npm = path.join(checkout, "npm-cli.cjs");
        const results = Array.from({ length: 1024 }, (_, i) => ({
            fatalErrorCount: outcome === "parser failure" ? 1 : 0,
            messages: i === 0 ? [{ ruleId: "@typescript-eslint/no-floating-promises" }] : [],
        }));
        await fs.writeFile(
            npm,
            `
            const assert = require("node:assert/strict");
            assert.deepEqual(process.argv.slice(2), ["run", "lint", "--", "--format", "json", "--output-file", "results.json"]);
            if (${JSON.stringify(outcome)} === "invocation failure") {
                console.error("npm-invocation-failed");
                process.exit(1);
            }
            require("node:fs").writeFileSync("results.json", ${JSON.stringify(JSON.stringify(results))});
            process.exit(${outcome === "unexpected status" ? 2 : outcome === "unexpected success" ? 0 : 1});
        `,
        );
        const run = () =>
            execFileSync(process.execPath, [
                fileURLToPath(new URL("../../../cases/api/eslint.mjs", import.meta.url)),
                f.output,
            ], {
                cwd: checkout,
                env: { ...process.env, TSPERF_NPM_CLI: npm },
                stdio: "pipe",
            });
        if (outcome === "finding") {
            expect(run).not.toThrow();
            await expect(fs.access(path.join(workDir, "results.json"))).rejects.toMatchObject({ code: "ENOENT" });
        }
        else {
            let failure: unknown;
            try {
                run();
            }
            catch (error) {
                failure = error;
            }
            expect(failure).toBeInstanceOf(Error);
            const message = String(failure);
            if (outcome === "invocation failure") {
                expect(message).toContain("npm-invocation-failed");
                expect(message).not.toContain("ENOENT");
            }
            if (outcome === "parser failure") expect(message).toContain("ESLint parser failure");
            if (outcome === "unexpected success") expect(message).toContain("Expected one lint finding");
        }
    },
);
