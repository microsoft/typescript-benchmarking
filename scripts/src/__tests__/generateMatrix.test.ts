import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";

import { execa } from "execa";
import { test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const presets = [
    "full",
    "regular",
    "tsc-only",
    "bun",
    "vscode",
    "public",
];

const envs = [
    {},
    { USE_BASELINE_MACHINE: "true" },
];

// https://github.com/vitest-dev/vitest/issues/4963
// https://github.com/vitest-dev/vitest/issues/4642
for (const preset of presets) {
    for (const env of envs) {
        test.concurrent(`generateMatrix preset=${preset} env=${util.inspect(env)}`, async ({ expect }) => {
            const result = await execa(
                "tsx",
                [path.join(__dirname, "../generateMatrix.ts"), "--preset", preset],
                {
                    env,
                    reject: false,
                },
            );
            expect(result.stdout, "stdout").toMatchSnapshot();
            expect(result.stderr, "stderr").toMatchSnapshot();
            expect(result.exitCode, "exitCode").toMatchSnapshot();
        });
    }
}
