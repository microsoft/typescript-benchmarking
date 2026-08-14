import { expect, test } from "vitest";

import { getLspServerCommand } from "../src/benchmark/lspServerCommand.js";

test("runs the LSP server directly without CPU affinity", () => {
    expect(getLspServerCommand("/path/to/tsc", ["--lsp", "--stdio"], undefined)).toEqual({
        command: "/path/to/tsc",
        args: ["--lsp", "--stdio"],
    });
});

test("runs the LSP server through taskset with CPU affinity", () => {
    expect(getLspServerCommand("/path/to/tsc", ["--lsp", "--stdio"], "2-3", "linux")).toEqual({
        command: "taskset",
        args: ["--cpu-list", "2-3", "/path/to/tsc", "--lsp", "--stdio"],
    });
});

test("rejects CPU affinity on unsupported platforms", () => {
    expect(() => getLspServerCommand("/path/to/tsc", [], "2-3", "win32")).toThrow("--cpus only works on Linux");
});
