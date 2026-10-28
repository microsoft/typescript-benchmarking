import assert from "node:assert";
import fs from "node:fs";

import esMain from "es-main";

import { sleepSeconds } from "./utils.js";

const resources = ["cpu", "io", "memory"] as const;
type Resource = typeof resources[number];

interface CpuTimes {
    name: string;
    total: number;
    idle: number;
}

function readCpuTimes(): CpuTimes[] {
    const cpus = fs.readFileSync("/proc/stat", "utf8").split("\n").filter(line => /^cpu\d+\s/.test(line));
    assert(cpus.length > 0, "Missing per-CPU counters in /proc/stat");
    return cpus.map(line => {
        const [name, ...fields] = line.trim().split(/\s+/);
        // Guest time is already included in user/nice; do not count it twice.
        const counters = fields.slice(0, 8).map(Number);
        assert(
            counters.length === 8 && counters.every(value => Number.isSafeInteger(value) && value >= 0),
            "Invalid CPU counters in /proc/stat",
        );
        return { name, total: counters.reduce((a, b) => a + b, 0), idle: counters[3] };
    });
}

export async function waitForBenchmarkIdle(requiredSeconds = 5) {
    const unavailable = new Set<Resource>();
    function readPressure(): Partial<Record<Resource, number>> {
        const pressure: Partial<Record<Resource, number>> = {};
        for (const resource of resources) {
            if (unavailable.has(resource)) continue;
            let contents: string;
            try {
                contents = fs.readFileSync(`/proc/pressure/${resource}`, "utf8");
            }
            catch (error) {
                if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                    unavailable.add(resource);
                    console.warn(
                        `##vso[task.logissue type=warning]${resource} pressure counters unavailable; checking remaining idle signals.`,
                    );
                    continue;
                }
                throw error;
            }
            const total = contents.match(/^some\s+.*\btotal=(\d+)\s*$/m)?.[1];
            assert(total !== undefined, `Missing ${resource} pressure counter`);
            pressure[resource] = Number(total);
            assert(Number.isSafeInteger(pressure[resource]), `Invalid ${resource} pressure counter`);
        }
        return pressure;
    }

    function sample() {
        return { cpus: readCpuTimes(), pressure: readPressure(), time: performance.now() };
    }

    assert(
        Number.isInteger(requiredSeconds) && requiredSeconds > 0,
        "Expected a positive whole number of quiet seconds",
    );
    console.log(
        `Waiting up to 60s for ${requiredSeconds} consecutive quiet seconds: CPU average <=5%, peak <=20%, pressure <=1%.`,
    );
    let previous = sample();
    const start = previous.time;
    let quietSeconds = 0;
    let lastSummary = "";
    while (previous.time - start < 60_000) {
        await sleepSeconds(1);
        const current = sample();
        const elapsedMs = current.time - previous.time;
        assert(elapsedMs > 0, "Expected elapsed time between idle samples");
        assert(current.cpus.length === previous.cpus.length, "Online CPUs changed during idle check");

        let totalTicks = 0;
        let busyTicks = 0;
        let peakBusy = 0;
        for (let index = 0; index < current.cpus.length; index++) {
            const cpu = current.cpus[index];
            const before = previous.cpus[index];
            assert(cpu.name === before.name, "Online CPUs changed during idle check");
            const total = cpu.total - before.total;
            const idle = cpu.idle - before.idle;
            assert(total > 0 && idle >= 0 && idle <= total, "Invalid CPU counter delta during idle check");
            totalTicks += total;
            busyTicks += total - idle;
            peakBusy = Math.max(peakBusy, 100 * (total - idle) / total);
        }
        const averageBusy = 100 * busyTicks / totalTicks;
        let quiet = averageBusy <= 5 && peakBusy <= 20;
        const pressures: string[] = [];
        for (const resource of resources) {
            const total = current.pressure[resource];
            const before = previous.pressure[resource];
            if (total === undefined || before === undefined) continue;
            const delta = total - before;
            assert(delta >= 0, `${resource} pressure counter decreased during idle check`);
            const percent = 100 * delta / (elapsedMs * 1000);
            pressures.push(`${resource}=${percent.toFixed(2)}%`);
            quiet &&= percent <= 1;
        }
        lastSummary = `CPU average=${averageBusy.toFixed(2)}%, peak=${peakBusy.toFixed(2)}%; pressure ${
            pressures.length ? pressures.join(", ") : "unavailable"
        }`;
        quietSeconds = quiet ? quietSeconds + elapsedMs / 1000 : 0;
        console.log(
            `${((current.time - start) / 1000).toFixed(1)}s: ${lastSummary}; quiet=${quietSeconds.toFixed(1)}s`,
        );
        if (quietSeconds >= requiredSeconds) {
            console.log("Machine is quiet; starting benchmark without discarding any measured samples.");
            return;
        }
        previous = current;
    }
    throw new Error(`Machine did not become quiet within 60s; benchmark not started. ${lastSummary}`);
}

if (esMain(import.meta)) {
    await waitForBenchmarkIdle(process.argv[2] === undefined ? undefined : Number(process.argv[2])).catch(
        (error: unknown) => {
            console.error(error);
            process.exitCode = 1;
        },
    );
}
