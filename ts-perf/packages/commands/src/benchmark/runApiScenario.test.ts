import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { apiTimingSampleKeys, Host, HostSpecifier, Measurement, Scenario } from "@ts-perf/api";
import { HostContext, Logger } from "@ts-perf/core";
import { expect, test, vi } from "vitest";

import { measureAndRunScenarios } from "./measure";
import { runApiProcess, runApiScenario } from "./runApiScenario";

const commit = "a".repeat(40);
const context = new HostContext(new Logger(0));

test("propagates command crashes and missing executables", async () => {
    const args = ["-e", "console.error('consumer-crash'); process.exit(1)"];
    await expect(runApiProcess(process.execPath, args)).rejects.toThrow(/1.*consumer-crash/s);
    await expect(runApiProcess(process.execPath, ["-e", "process.exit(2)"]))
        .rejects.toThrow("failed (2)");
    await expect(runApiProcess("/nonexistent/tsperf-node", [])).rejects.toThrow();
});

async function fixture(callback: (root: string, scenario: Scenario) => Promise<void>) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-api-test-")));
    try {
        await fs.writeFile(path.join(root, "info.json"), JSON.stringify({ commit }));
        await fs.mkdir(path.join(root, "test-api"));
        await fs.writeFile(
            path.join(root, "runner.mjs"),
            `
            import assert from "node:assert/strict";
            import fs from "node:fs/promises";
            import path from "node:path";
            import { randomUUID } from "node:crypto";
            import { fileURLToPath } from "node:url";
            const args = process.argv.slice(2);
            if (args.some(arg => ["--prepare", "--check", "--builtDir", "--workDir"].includes(arg))) {
                throw Error("unexpected injected argument");
            }
            const root = path.dirname(fileURLToPath(import.meta.url));
            assert.deepEqual(args.slice(0, 3), [root, root, root]);
            assert.equal(process.cwd(), path.join(root, "test-api"));
            await new Promise(resolve => setTimeout(resolve, Number(args.at(-1))));
            if (args.includes("--fail-check")) throw Error("invalid output");
            if (!args.includes("--missing-dumps")) {
                const instanceId = randomUUID();
                const dump = {
                    schemaVersion: 1, instanceId, pid: process.pid, mode: "sync", transport: "spawn",
                    startedAt: new Date().toISOString(), closedAt: new Date().toISOString(),
                    timing: {
                        enabled: true,
                        totals: {
                            requestCount: 1, roundTripMs: 1, bytesSent: 1, bytesReceived: 1,
                            serverTimeMs: 0, transportOverheadMs: 1,
                            nodesMaterialized: 1, sourceFilesFetched: 1, nodesFetched: 1,
                        },
                        recentRequests: [],
                    },
                    serverTiming: { enabled: true, totals: { requestCount: 1, totalProcessingTimeMs: 0 } },
                };
                await fs.writeFile(
                    path.join(process.env.TS_API_TIMING_DIR, "timing-"+process.pid+"-"+instanceId+".json"),
                    JSON.stringify(dump),
                );
            }
        `,
        );
        await callback(
            root,
            new Scenario("test-api", "api", path.join(root, "scenario.json"), [
                "${scenarioDirectory}/runner.mjs",
                "${typescriptDirectory}",
                "${suiteDirectory}",
                "${scenarioDirectory}",
                "5",
            ]),
        );
    }
    finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

test("times the whole script with declared arguments, standard expansions and the solution working directory", async () => {
    await fixture(async (root, scenario) => {
        const run = (delay: number) =>
            runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), String(delay)] }),
                Host.current,
                {
                    builtDir: path.relative(process.cwd(), root),
                    suiteDir: path.relative(process.cwd(), root),
                    iterations: 2,
                    warmups: 1,
                },
                context,
                0,
                HostSpecifier.create(Host.current),
                0,
            );
        const slow = await run(120);
        expect((await fs.stat(path.join(root, scenario.name))).isDirectory()).toBe(true);
        expect(slow.values!.totalTime!.samples.every(sample => sample >= 0.12)).toBe(true);
        const restored = Measurement.create(JSON.parse(JSON.stringify(slow)));
        expect(restored.values!.totalTime!.samples).toHaveLength(2);
        for (const key of apiTimingSampleKeys) {
            expect(restored.values?.[key]?.samples).toEqual(slow.values?.[key]?.samples);
            expect(restored.values?.[key]?.unit).toBe(slow.values?.[key]?.unit);
            expect(restored.values?.[key]?.metric).toBe(slow.values?.[key]?.metric);
        }
        expect(restored.diff(slow)?.values.apiBytesSent?.benchmarkRelativeDelta).toBe(0);
        expect(restored.merge(slow).values?.apiRoundTripTime?.samples).toEqual([1, 1, 1, 1]);
    });
});

test("requires the solution prepared by setup.sh rather than creating it during measurement", async () => {
    await fixture(async (root, scenario) => {
        await fs.rmdir(path.join(root, scenario.name));
        await expect(runApiScenario(
            scenario,
            Host.current,
            { builtDir: root, suiteDir: root, iterations: 1 },
            context,
            0,
            HostSpecifier.create(Host.current),
            0,
        )).rejects.toThrow(`Run ${path.join(root, "setup.sh")} before benchmarking.`);
        await expect(fs.access(path.join(root, scenario.name))).rejects.toMatchObject({ code: "ENOENT" });
    });
});

test("failed output checks fail the benchmark without a result protocol", async () => {
    await fixture(async (root, scenario) => {
        await expect(runApiScenario(
            scenario.with({ args: [...scenario.args!.slice(0, -1), "--fail-check", "5"] }),
            Host.current,
            { builtDir: root, suiteDir: root, iterations: 1 },
            context,
            0,
            HostSpecifier.create(Host.current),
            0,
        )).rejects.toThrow("invalid output");
    });
});

test("preserves warmup counts and fails rather than omitting missing dumps", async () => {
    await fixture(async (root, scenario) => {
        const scenarios = vi.spyOn(Scenario, "findScenarios").mockResolvedValue([scenario]);
        const hosts = vi.spyOn(Host, "findHosts").mockResolvedValue([Host.current]);
        try {
            const report = await measureAndRunScenarios({
                kind: "api",
                options: { builtDir: root, suiteDir: root, iterations: 1, warmups: 2 },
            }, context);
            expect(JSON.parse(JSON.stringify(report)).warmups).toBe(2);
            expect(report.measurements[0].values!.totalTime!.samples).toHaveLength(1);
            expect(report.measurements[0].values!.apiRequests!.samples).toEqual([1]);
            scenarios.mockResolvedValue([scenario.with({
                args: [...scenario.args!.slice(0, -1), "--missing-dumps", "5"],
            })]);
            await expect(measureAndRunScenarios({
                kind: "api",
                options: { builtDir: root, suiteDir: root, iterations: 1 },
            }, context)).rejects.toThrow("Missing API timing dumps");
        }
        finally {
            scenarios.mockRestore();
            hosts.mockRestore();
        }
    });
});
