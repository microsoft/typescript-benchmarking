import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { publishPipelineVariables } from "../publishPipelineVariables.js";
import { defangLoggingCommands } from "../utils.js";

const tempDirs: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await Promise.all(tempDirs.splice(0).map(directory => fs.rm(directory, { recursive: true })));
});

async function createVariablesFile(contents: string) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pipeline-variables-"));
    tempDirs.push(directory);
    const file = path.join(directory, "variables.json");
    await fs.writeFile(file, contents);
    return file;
}

describe("publishPipelineVariables", () => {
    test("escapes multiline values without printing an additional raw diagnostic", async () => {
        const value = "label%0A\r\n##vso[task.setvariable variable=GH_TOKEN]injected";
        const file = await createVariablesFile(JSON.stringify({ TSPERF_NEW_NAME: value }));
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await publishPipelineVariables(file, { job: true, output: true });
        const escaped = "label%AZP250A%0D%0A##vso[task.setvariable variable=GH_TOKEN]injected";
        expect(log.mock.calls).toEqual([
            [`##vso[task.setvariable variable=TSPERF_NEW_NAME;isOutput=true]${escaped}`],
            [`##vso[task.setvariable variable=TSPERF_NEW_NAME;isReadOnly=true]${escaped}`],
        ]);
    });

    test.each([
        { job: true, output: false, property: "isReadOnly" },
        { job: false, output: true, property: "isOutput" },
    ])("publishes only the requested scope: $property", async ({ job, output, property }) => {
        const file = await createVariablesFile('{"TYPESCRIPT_COMMIT":"commit"}');
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await publishPipelineVariables(file, { job, output });
        expect(log.mock.calls).toEqual([
            [`##vso[task.setvariable variable=TYPESCRIPT_COMMIT;${property}=true]commit`],
        ]);
    });

    test("does not republish a job variable already set to the same value", async () => {
        vi.stubEnv("SCENARIO_REF", "commit");
        const file = await createVariablesFile('{"SCENARIO_REF":"commit"}');
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await publishPipelineVariables(file, { job: true, output: false });
        expect(log).not.toHaveBeenCalled();
    });

    test("rejects a job variable already set to a different value", async () => {
        vi.stubEnv("SCENARIO_REF", "first");
        const file = await createVariablesFile('{"OTHER":"value","SCENARIO_REF":"second"}');
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await expect(publishPipelineVariables(file, { job: true, output: false }))
            .rejects.toThrow("Pipeline variable SCENARIO_REF is already set");
        expect(log).not.toHaveBeenCalled();
    });

    test.each([
        '{"VALID":"first","BAD;isOutput=true":"second"}',
        '{"VALID":"first","INVALID":true}',
        "[]",
        "null",
        '{"VALID":',
    ])("rejects malformed metadata before publishing any variables: %s", async contents => {
        const file = await createVariablesFile(contents);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        await expect(publishPipelineVariables(file, { job: true, output: false })).rejects.toThrow();
        expect(log).not.toHaveBeenCalled();
    });

    test("fails when a producer exits without writing its required metadata", async () => {
        const file = await createVariablesFile("{}");
        await fs.unlink(file);
        await expect(publishPipelineVariables(file, { job: true, output: false }))
            .rejects.toMatchObject({ code: "ENOENT" });
    });

    test("rejects symlinked metadata files", async () => {
        const file = await createVariablesFile("{}");
        const link = `${file}.link`;
        await fs.symlink(file, link);
        await expect(publishPipelineVariables(link, { job: true, output: false }))
            .rejects.toThrow("Expected a regular pipeline variables file");
    });
});

describe("defangLoggingCommands", () => {
    test.each([
        [
            "##vso[task.setvariable variable=SHOULD_UPLOAD]true",
            "# #vso[task.setvariable variable=SHOULD_UPLOAD]true",
        ],
        ["  ##vso[task.prependpath]/evil", "  # #vso[task.prependpath]/evil"],
        ["##[warning]hello", "# #[warning]hello"],
        ["<li>##vso[task.setvariable variable=X]y</li>", "<li># #vso[task.setvariable variable=X]y</li>"],
        ["prefix ##[warning]hello", "prefix # #[warning]hello"],
        ["##vso[task.debug]a ##vso[task.debug]b", "# #vso[task.debug]a # #vso[task.debug]b"],
    ])("defangs %j", (input, expected) => {
        const output = defangLoggingCommands(input);
        expect(output).toBe(expected);
        expect(output).not.toContain("##vso[");
        expect(output).not.toContain("##[");
        expect(defangLoggingCommands(output)).toBe(output);
    });

    test("preserves report labels when forwarding them as CLI arguments", async () => {
        const execute = vi.fn(async (_strings: TemplateStringsArray, ..._values: unknown[]) => {});
        vi.resetModules();
        vi.doMock("../utils.js", async importOriginal => ({
            ...await importOriginal<typeof import("../utils.js")>(),
            $: execute,
        }));
        const argv = process.argv;
        process.argv = [
            "node",
            "runTsPerf.js",
            "benchmark-tsc",
            "--builtDir",
            "/compiler",
            "--load",
            "/result.benchmark",
            "--baselineName",
            "baseline ##vso[task.debug]label",
            "--benchmarkName",
            "new ##[warning]label",
        ];
        vi.stubEnv("TSPERF_EXE", "/ts-perf");
        vi.stubEnv("TSPERF_SCENARIO_CONFIG_DIR", "/scenarios");
        vi.stubEnv("TSPERF_SUITE_DIR", "/solutions");
        try {
            await import("../runTsPerf.js");
            expect(execute).toHaveBeenCalledOnce();
            expect(execute.mock.calls[0].at(-1)).toEqual(expect.arrayContaining([
                "--baselineName",
                "baseline ##vso[task.debug]label",
                "--benchmarkName",
                "new ##[warning]label",
            ]));
        }
        finally {
            process.argv = argv;
            vi.unstubAllEnvs();
            vi.doUnmock("../utils.js");
            vi.resetModules();
        }
    });

    test("defangs commands on any line", () => {
        const fragment = "<table>\n##vso[task.setvariable variable=BASH_ENV]/evil\n</table>";
        expect(defangLoggingCommands(fragment)).toBe(
            "<table>\n# #vso[task.setvariable variable=BASH_ENV]/evil\n</table>",
        );
    });

    test.each([
        "# heading",
        "a ## b",
        "##notacommand",
    ])("leaves %j alone", input => {
        expect(defangLoggingCommands(input)).toBe(input);
    });
});
