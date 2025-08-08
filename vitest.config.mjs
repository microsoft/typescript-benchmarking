import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        projects: [
            "scripts",
            // "ts-perf",
            // "ts-perf/packages/*",
        ],
    },
});
