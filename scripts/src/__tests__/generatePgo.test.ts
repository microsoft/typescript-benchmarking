import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { getCompilerArgs, getPgoScenarios, profileScenario } from "../generatePgo.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));

test.each(await getPgoScenarios())(
    "%s uses its benchmark config with emit enabled and diagnostic reporting disabled",
    scenario => {
        const args = getCompilerArgs(root, scenario, "/emit", "/profiles");
        expect(args.join(" ")).not.toContain("${");
        expect(args.slice(-8)).toEqual([
            "--diagnostics",
            "false",
            "--extendedDiagnostics",
            "false",
            "--pretty",
            "false",
            "--pprofDir",
            "/profiles",
        ]);
        if (args[0] === "-b") expect(args).toContain("--force");
        else expect(args).toEqual(expect.arrayContaining(["--noEmit", "false", "--outDir", "/emit"]));
        if (scenario === "tanstack-router") {
            expect(args).toEqual(expect.arrayContaining(["--declaration", "false"]));
        }
    },
);

test("collection invokes the compiler once and fails if it produces no CPU profile", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pgo-test-"));
    try {
        const scenario = path.join(directory, "cases/scenarios/class-transformer");
        fs.mkdirSync(scenario, { recursive: true });
        fs.mkdirSync(path.join(directory, "cases/solutions/class-transformer"), { recursive: true });
        fs.copyFileSync(
            path.join(root, "cases/scenarios/class-transformer/scenario.json"),
            path.join(scenario, "scenario.json"),
        );
        const binary = path.join(directory, "tsc");
        fs.writeFileSync(
            binary,
            `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(__filename + ".calls", "called\\n");
fs.writeFileSync(args[args.indexOf("--pprofDir") + 1] + "/123-cpuprofile.pb.gz", "fixture");
`,
        );
        profileScenario(directory, "class-transformer", binary, path.join(directory, "profiles"), "/emit");
        expect(fs.readFileSync(binary + ".calls", "utf8")).toBe("called\n");
        fs.writeFileSync(binary, "#!/usr/bin/env node\n");
        expect(() => profileScenario(directory, "class-transformer", binary, path.join(directory, "missing"), "/emit"))
            .toThrow("Expected one CPU profile");
    }
    finally {
        fs.rmSync(directory, { recursive: true });
    }
});
