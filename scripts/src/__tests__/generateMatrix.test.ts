import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";

import { execa } from "execa";
import { test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tests = [
    { preset: "full", env: {} },
    { preset: "full", env: { USE_BASELINE_MACHINE: "true" } },
    { preset: "regular", env: {} },
    { preset: "tsc-only", env: {} },
    { preset: "bun", env: {} },
    { preset: "vscode", env: {} },
    { preset: "public", env: {} },
];

// https://github.com/vitest-dev/vitest/issues/4963
// https://github.com/vitest-dev/vitest/issues/4642
for (const t of tests) {
    test.concurrent(`generateMatrix ${util.inspect(t)}`, async ({ expect }) => {
        const result = await execa(
            "tsx",
            [path.join(__dirname, "../generateMatrix.ts"), "--preset", t.preset],
            {
                env: t.env,
                reject: false,
            },
        );
        expect(result.stdout, "stdout").toMatchSnapshot();
        expect(result.stderr, "stderr").toMatchSnapshot();
        expect(result.exitCode, "exitCode").toMatchSnapshot();
    });
}
