import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@ts-perf/api": fileURLToPath(new URL("../api/src/index.ts", import.meta.url)),
            "@ts-perf/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
        },
    },
    test: {
        exclude: [...configDefaults.exclude, "**/dist/**"],
    },
});
