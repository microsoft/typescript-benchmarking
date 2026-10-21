import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { apiTimingSampleKeys, CommonExpansionProvider, Host, HostSpecifier, Measurement, Scenario } from "@ts-perf/api";
import { HostContext, Logger } from "@ts-perf/core";
import { expect, test, vi } from "vitest";

import { measureAndRunScenarios } from "./measure";
import { runApiProcess, runApiScenario } from "./runApiScenario";

const commit = "a".repeat(40);
const context = new HostContext(new Logger(0));
const utilsModule = pathToFileURL(path.resolve(__dirname, "../../../../../cases/api/utils.mjs")).href;

test("propagates command crashes and missing executables", async () => {
    const args = ["-e", "console.error('consumer-crash'); process.exit(1)"];
    await expect(runApiProcess(process.execPath, args)).rejects.toThrow(/1.*consumer-crash/s);
    await expect(runApiProcess(process.execPath, ["-e", "process.exit(2)"]))
        .rejects.toThrow("failed (2)");
    await expect(runApiProcess("/nonexistent/tsperf-node", [])).rejects.toThrow();
});

async function fixture(callback: (root: string, scenario: Scenario, host: Host) => Promise<void>) {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tsperf-api-test-")));
    try {
        await fs.writeFile(path.join(root, "info.json"), JSON.stringify({ commit }));
        await fs.mkdir(path.join(root, "test-api"));
        await fs.writeFile(
            path.join(root, "npm-cli.cjs"),
            `require("node:assert/strict").deepEqual(process.argv.slice(2), ["run", "workload", "--", "argument with spaces"]);`,
        );
        await fs.writeFile(
            path.join(root, "runner.mjs"),
            `
            import assert from "node:assert/strict";
            import fs from "node:fs/promises";
            import path from "node:path";
            import { randomUUID } from "node:crypto";
            import { execFileSync } from "node:child_process";
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
            if (args.includes("--verify-node")) execFileSync("node", ["-e", ""], { stdio: "inherit" });
            if (args.includes("--verify-npm")) {
                const { run } = await import(${JSON.stringify(utilsModule)});
                run("npm", ["run", "workload", "--", "argument with spaces"], process.cwd());
            }
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
            Host.current.with({ name: "node", npm: "npm-cli.cjs", configFile: path.join(root, "host.json") }),
        );
    }
    finally {
        await fs.rm(root, { recursive: true, force: true });
    }
}

test("times the whole script with declared arguments, standard expansions and the solution working directory", async () => {
    await fixture(async (root, scenario, host) => {
        const run = (delay: number) =>
            runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), String(delay)] }),
                host,
                {
                    builtDir: path.relative(process.cwd(), root),
                    suiteDir: path.relative(process.cwd(), root),
                    iterations: 2,
                    warmups: 1,
                },
                context,
                0,
                HostSpecifier.create(host),
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

test("expands the installed host path and uses bundled npm rather than an ambient shim", async () => {
    await fixture(async (root, scenario, installedHost) => {
        const bin = path.join(root, "bin");
        const executable = path.join(bin, "node");
        const log = path.join(root, "node-invocations");
        await fs.mkdir(bin);
        await fs.writeFile(
            executable,
            `#!${process.execPath}
            const fs = require("node:fs");
            const { spawnSync } = require("node:child_process");
            fs.appendFileSync(${JSON.stringify(log)}, "node\\n");
            const result = spawnSync(${JSON.stringify(process.execPath)}, process.argv.slice(2), { stdio: "inherit" });
            if (result.error) throw result.error;
            process.exit(result.status ?? 1);
        `,
        );
        await fs.chmod(executable, 0o755);
        await fs.writeFile(path.join(bin, "npm"), "#!/bin/sh\necho ambient-npm-shim >&2\nexit 1\n");
        await fs.chmod(path.join(bin, "npm"), 0o755);
        const host = installedHost.with({
            name: "node",
            executableFile: "${hostsDirectory}/bin/node",
        });
        const expansion = vi.spyOn(CommonExpansionProvider.prototype, "expand")
            .mockImplementation(name => name === "hostsdirectory" ? root : undefined);
        try {
            await runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), "--verify-node", "--verify-npm", "5"] }),
                host,
                { builtDir: root, suiteDir: root, iterations: 1 },
                context,
                0,
                HostSpecifier.create(host),
                0,
            );
        }
        finally {
            expansion.mockRestore();
        }
        expect(await fs.readFile(log, "utf8")).toBe("node\nnode\n");
    });
});

test("rejects predictable mode before starting an API consumer", async () => {
    await fixture(async (root, scenario) => {
        await expect(runApiScenario(
            scenario,
            Host.current,
            { builtDir: root, suiteDir: root, iterations: 1, predictable: true },
            context,
            0,
            HostSpecifier.create(Host.current),
            0,
        )).rejects.toThrow("do not support --predictable");
    });
});

test.each([undefined, [`node@${process.version}`]])(
    "measures only the installed Node when the ambient version matches (hosts: %j)",
    async hosts => {
        await fixture(async (root, scenario, host) => {
            const scenarios = vi.spyOn(Scenario, "findScenarios").mockResolvedValue([scenario]);
            const availableHosts = vi.spyOn(Host, "getAvailableHosts").mockResolvedValue([host, Host.current]);
            try {
                expect(await Host.findHosts(hosts)).toEqual([host, Host.current]);
                const report = await measureAndRunScenarios({
                    kind: "api",
                    options: { builtDir: root, suiteDir: root, iterations: 1, hosts },
                }, context);
                expect(report.hosts).toEqual([host]);
                expect(report.measurements).toHaveLength(1);
            }
            finally {
                scenarios.mockRestore();
                availableHosts.mockRestore();
            }
        });
    },
);

test("requires an installed host rather than falling back to ambient Node", async () => {
    await fixture(async (root, scenario) => {
        const scenarios = vi.spyOn(Scenario, "findScenarios").mockResolvedValue([scenario]);
        const availableHosts = vi.spyOn(Host, "getAvailableHosts").mockResolvedValue([Host.current]);
        try {
            await expect(measureAndRunScenarios({
                kind: "api",
                options: { builtDir: root, suiteDir: root, iterations: 1 },
            }, context)).rejects.toThrow("No matching Node host");
            await expect(runApiScenario(
                scenario,
                Host.current,
                { builtDir: root, suiteDir: root, iterations: 1 },
                context,
                0,
                HostSpecifier.create(Host.current),
                0,
            )).rejects.toThrow("Node host with bundled npm");
        }
        finally {
            scenarios.mockRestore();
            availableHosts.mockRestore();
        }
    });
});

async function expectFailedMeasurement(measurement: Promise<Measurement>, message: string) {
    const error = vi.spyOn(context, "error");
    try {
        expect((await measurement).failed).toBe(true);
        expect(error).toHaveBeenCalledWith(expect.stringContaining(message));
    }
    finally {
        error.mockRestore();
    }
}

test("reports bundled npm failures without falling back to PATH", async () => {
    await fixture(async (root, scenario, host) => {
        await fs.writeFile(path.join(root, "npm-cli.cjs"), "console.error('npm-workload-failed'); process.exit(2);");
        await expectFailedMeasurement(
            runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), "--verify-npm", "5"] }),
                host,
                { builtDir: root, suiteDir: root, iterations: 1 },
                context,
                0,
                HostSpecifier.create(host),
                0,
            ),
            "npm-workload-failed",
        );
        await fs.unlink(path.join(root, "npm-cli.cjs"));
        await expectFailedMeasurement(
            runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), "--verify-npm", "5"] }),
                host,
                { builtDir: root, suiteDir: root, iterations: 1 },
                context,
                0,
                HostSpecifier.create(host),
                0,
            ),
            "MODULE_NOT_FOUND",
        );
    });
});

test("requires the solution prepared by setup.sh rather than creating it during measurement", async () => {
    await fixture(async (root, scenario, host) => {
        await fs.rmdir(path.join(root, scenario.name));
        await expect(runApiScenario(
            scenario,
            host,
            { builtDir: root, suiteDir: root, iterations: 1 },
            context,
            0,
            HostSpecifier.create(host),
            0,
        )).rejects.toThrow(`Run ${path.join(root, "setup.sh")} before benchmarking.`);
        await expect(fs.access(path.join(root, scenario.name))).rejects.toMatchObject({ code: "ENOENT" });
    });
});

test("failed output checks mark the measurement failed without a result protocol", async () => {
    await fixture(async (root, scenario, host) => {
        await expectFailedMeasurement(
            runApiScenario(
                scenario.with({ args: [...scenario.args!.slice(0, -1), "--fail-check", "5"] }),
                host,
                { builtDir: root, suiteDir: root, iterations: 1 },
                context,
                0,
                HostSpecifier.create(host),
                0,
            ),
            "invalid output",
        );
    });
});

test("preserves warmup counts and fails rather than omitting missing dumps", async () => {
    await fixture(async (root, scenario, host) => {
        const scenarios = vi.spyOn(Scenario, "findScenarios").mockResolvedValue([scenario]);
        const hosts = vi.spyOn(Host, "findHosts").mockResolvedValue([host]);
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
