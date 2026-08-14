import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "scripts",
            "ts-perf/packages/api",
            "ts-perf/packages/commands",
            // "ts-perf",
            // "ts-perf/packages/*",
        ],
    },
});
