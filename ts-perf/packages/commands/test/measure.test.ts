import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Writable } from "node:stream";

import { Host, Measurement, Scenario } from "@ts-perf/api";
import { HostContext, Logger } from "@ts-perf/core";
import { afterEach, expect, test, vi } from "vitest";

import { measureAndRunScenarios } from "../src/benchmark/measure.js";
import { printComparison as printConsoleComparison } from "../src/benchmark/print/console/comparison.js";
import { printComparison as printHtmlComparison } from "../src/benchmark/print/html/comparison.js";
import { printComparison as printMarkdownComparison } from "../src/benchmark/print/markdown/comparison.js";
import { resolveBuiltPath } from "../src/benchmark/resolveBuiltPath.js";

const tempDirs: string[] = [];

afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
        fs.rmSync(tempDir, { recursive: true });
    }
});

function createBuiltDir(file: string) {
    const builtDir = fs.mkdtempSync(path.join(os.tmpdir(), "typescript-benchmarking-"));
    tempDirs.push(builtDir);
    fs.writeFileSync(path.join(builtDir, file), "");
    return builtDir;
}

test("resolves the JavaScript compiler", () => {
    const builtDir = createBuiltDir("tsc.js");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsc.js"));
});

test("resolves the legacy tsgo compiler", () => {
    const builtDir = createBuiltDir("tsgo");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsgo"));
});

test("resolves the migrated native compiler for compiler and LSP scenarios", () => {
    const builtDir = createBuiltDir("tsc");
    expect(resolveBuiltPath(builtDir, "tsc")).toBe(path.join(builtDir, "tsc"));
    expect(resolveBuiltPath(builtDir, "tsgo")).toBe(path.join(builtDir, "tsc"));
});

test.each([undefined, 0, 1.234])("records CPU time %s without inventing unavailable values", async cpuTime => {
    const builtDir = createBuiltDir("tsc.js");
    fs.writeFileSync(
        path.join(builtDir, "tsc.js"),
        `console.log("Total time: 1.000s");
        ${cpuTime === undefined ? "" : `console.log("CPU time: ${cpuTime.toFixed(3)}s");`}`,
    );
    const scenarios = vi.spyOn(Scenario, "findScenarios").mockResolvedValue([
        new Scenario("test", "tsc", path.join(builtDir, "scenario.json"), []),
    ]);
    const hosts = vi.spyOn(Host, "findHosts").mockResolvedValue([Host.current]);
    try {
        const report = await measureAndRunScenarios({
            kind: "tsc",
            options: { builtDir, iterations: 2 },
        }, new HostContext(new Logger(0)));
        const value = report.measurements[0].values?.cpuTime;
        if (cpuTime === undefined) {
            expect(value).toBeUndefined();
        }
        else {
            expect(value?.samples).toEqual([cpuTime, cpuTime]);
            expect(value?.unit).toBe("s");
            expect(value?.precision).toBe(3);
            const baseline = report.with({
                measurements: report.measurements.map(measurement =>
                    Measurement.create({ ...measurement.getComponents(), cpuTime: undefined })
                ),
            });
            const comparison = report.diff(baseline, baseline)!;
            for (
                const [format, print] of [
                    ["html", printHtmlComparison],
                    ["html-fragment", printHtmlComparison],
                    ["markdown", printMarkdownComparison],
                    ["console", printConsoleComparison],
                ] as const
            ) {
                let output = "";
                const writer = new Writable({
                    write(chunk, _encoding, callback) {
                        output += chunk;
                        callback();
                    },
                });
                print(comparison, { format, baseline: "baseline", midline: "baseline" }, writer);
                expect(output).toContain("CPU time");
                expect(output).toContain(`${cpuTime.toFixed(3)}s`);
                expect(output).not.toContain("NaN");
                expect(output).not.toContain("Infinity");
            }
        }
    }
    finally {
        scenarios.mockRestore();
        hosts.mockRestore();
    }
});
