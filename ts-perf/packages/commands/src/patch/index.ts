import {
    AzureStorageOptions,
    Benchmark,
    Command,
    CommandMap,
    formatTestHost,
    Host,
    Measurement,
    Scenario,
} from "@ts-perf/api";
import { HostContext } from "@ts-perf/core";

export interface PatchOptions extends AzureStorageOptions {
    benchmark: string;
    patch: string;
    hosts: string[];
    scenarios: string[];
}

export async function patch(options: PatchOptions, host: HostContext) {
    const [benchmark, patch] = await Promise.all([
        Benchmark.loadAsync(options.benchmark, options),
        Benchmark.loadAsync(options.patch, options)
            .then(benchmark => benchmark.filter(options.scenarios, options.hosts)),
    ]);

    const scenarios: Scenario[] = [];
    const hosts: Host[] = [];
    const measurements: Measurement[] = [];
    for (const patchMeasurement of patch.measurements) {
        let wasPatchedInline = false;
        const patchComponents = patchMeasurement.getComponents();
        const patchHost = patch.hosts[patchComponents.hostIndex!];
        const patchHostName = patchHost.spec.toString();
        const patchScenario = patch.scenarios[patchComponents.scenarioIndex!];

        // adjust the host and scenario indices
        patchComponents.hostIndex = benchmark.hosts.findIndex(host => formatTestHost(host) === patchHostName);
        patchComponents.scenarioIndex = benchmark.measurements.findIndex(scenario =>
            scenario.name === patchScenario.name
        );

        // if the host and scenario already exist, try to find and update the benchmark
        if (patchComponents.hostIndex >= 0 && patchComponents.scenarioIndex >= 0) {
            const benchmarkMeasurement = benchmark.measurements.find(measurement =>
                measurement.name === patchMeasurement.name
            );
            if (benchmarkMeasurement) {
                if (deepEqual(benchmarkMeasurement, patchComponents)) {
                    continue;
                }

                Object.assign(benchmarkMeasurement, patchComponents);
                wasPatchedInline = true;
            }
        }

        if (!wasPatchedInline) {
            // add the host if missing
            if (patchComponents.hostIndex === -1) {
                patchComponents.hostIndex = benchmark.hosts.length;
                hosts.push(patchHost);
            }

            // add the scenario if missing
            if (patchComponents.scenarioIndex === -1) {
                patchComponents.scenarioIndex = benchmark.measurements.length;
                scenarios.push(patchScenario);
            }

            // add the measurement.
            measurements.push(patchMeasurement.with(patchComponents));
        }

        host.log(`patched '${patchMeasurement.name}'`);
    }

    await benchmark.with({ hosts, scenarios, measurements }).saveAsync(options.benchmark, options);
}

function deepEqual(left: any, right: any) {
    if (left === right) return true;
    if (!left || !right) return false;
    for (const key in left) {
        if (!(key in right)) return false;
        if (left[key] !== right[key]) {
            if (
                typeof left[key] !== "object"
                || typeof right[key] !== "object"
                || !deepEqual(left[key], right[key])
            ) {
                return false;
            }
        }
    }
    for (const key in right) {
        if (!(key in left)) return false;
    }
    return true;
}

const command: Command<PatchOptions> = {
    commandName: "patch",
    summary: "Patch a benchmark.",
    description: "Adds or updates measurements in a benchmark with those from another benchmark.",
    include: ["azureStorage"],
    options: {
        benchmark: {
            type: "string",
            required: true,
            position: 0,
            param: "file",
            description: "The benchmark to patch.",
        },
        patch: {
            type: "string",
            required: true,
            position: 1,
            param: "file",
            description: "The patch.",
        },
        hosts: {
            type: "string",
            longName: "host",
            alias: "hosts",
            multiple: true,
            defaultValue: () => [],
            param: "host",
            description:
                "Patch only the specified <host>. A host has one of the following forms:\n- A known host, restricted by version and processor architecture:\n  <name>[,version=v<version>][,arch=<arch>]\n- A path to an executable:\n  <file>",
        },
        scenarios: {
            type: "string",
            longName: "scenario",
            alias: "scenarios",
            multiple: true,
            defaultValue: () => [],
            param: "scenario",
            description: "Patch only the named <scenario>.",
        },
    },
    exec: ({ options }, host) => patch(options, host),
};

export function registerCommands(commands: CommandMap) {
    commands.patch = command;
}
