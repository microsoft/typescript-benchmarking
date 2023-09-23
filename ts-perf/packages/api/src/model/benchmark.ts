import fs from "node:fs";

import { BlobServiceClient } from "@azure/storage-blob";
import { SystemInfo, SystemInfoComponents } from "@ts-perf/core";
import { Query } from "iterable-query";

import { getBlobContainer, getBlobService } from "../azure";
import { AzureStorageOptions } from "../options";
import { BenchmarkComparison } from "./benchmarkComparison";
import { BenchmarkHeader } from "./benchmarkHeader";
import { Host, HostComponents } from "./host";
import { HostPattern } from "./hostPattern";
import { Measurement, MeasurementComponents } from "./measurement";
import { Repository, RepositoryComponents } from "./repository";
import { Scenario, ScenarioComponents } from "./scenario";

const blobPrefixRegExp = /^blob:/i;

export interface BenchmarkComponents {
    date?: string;
    system?: SystemInfo | SystemInfoComponents;
    repository?: Repository | RepositoryComponents;
    iterations?: number;
    scenarios?: readonly (Scenario | ScenarioComponents)[];
    hosts?: readonly (Host | HostComponents)[];
    measurements?: readonly (Measurement | MeasurementComponents)[];
    isolatedCpus?: string;
    predictable?: boolean;
}

export class Benchmark {
    public static readonly version = "2";

    public readonly date: string | undefined;
    public readonly system: SystemInfo | undefined;
    public readonly repository: Repository | undefined;
    public readonly iterations: number;
    public readonly scenarios: readonly Scenario[];
    public readonly hosts: readonly Host[];
    public readonly measurements: readonly Measurement[];
    public readonly version: string = Benchmark.version;
    public readonly isolatedCpus: string | undefined;
    public readonly predictable: boolean | undefined;

    constructor(
        date: string | undefined,
        system: SystemInfo | undefined,
        repository: Repository | undefined,
        iterations = 0,
        scenarios: readonly Scenario[] = [],
        hosts: readonly Host[] = [],
        measurements: readonly Measurement[] = [],
        isolatedCpus?: string,
        predictable?: boolean,
    ) {
        this.date = date;
        this.system = system;
        this.repository = repository;
        this.iterations = iterations;
        this.scenarios = scenarios;
        this.hosts = hosts;
        this.measurements = measurements;
        this.isolatedCpus = isolatedCpus;
        this.predictable = predictable;
    }

    public static create(components: BenchmarkComponents) {
        return components instanceof Benchmark ? components : new Benchmark(
            components.date,
            components.system && SystemInfo.create(components.system),
            components.repository && Repository.create(components.repository),
            components.iterations,
            components.scenarios && components.scenarios.map(Scenario.create),
            components.hosts && components.hosts.map(Host.create),
            components.measurements && components.measurements.map(Measurement.create),
            components.isolatedCpus,
            components.predictable,
        );
    }

    public static parse(text: string) {
        const components = JSON.parse(text) as BenchmarkHeader & BenchmarkComponents;
        switch (components.version) {
            case "2":
                return this.create(components);
            default:
                throw new Error("Unsupported benchmark file format.");
        }
    }

    public static async loadAsync(file: string, options?: AzureStorageOptions) {
        if (blobPrefixRegExp.test(file)) {
            const blobService = getBlobService(options);
            const blobContainer = getBlobContainer(options);
            return this.loadBlobAsync(blobService, blobContainer, file.substr(5));
        }

        return this.parse(await fs.promises.readFile(file, "utf-8"));
    }

    public static async loadBlobAsync(service: BlobServiceClient, container: string, file: string) {
        const buffer = await service.getContainerClient(container).getBlobClient(file).downloadToBuffer();
        return this.parse(buffer.toString("utf8"));
    }

    public getComponents(): BenchmarkComponents {
        return {
            date: this.date,
            system: this.system,
            repository: this.repository,
            iterations: this.iterations,
            scenarios: this.scenarios,
            hosts: this.hosts,
            measurements: this.measurements,
            isolatedCpus: this.isolatedCpus,
            predictable: this.predictable,
        };
    }

    public with(components: BenchmarkComponents) {
        const { date = this.date } = components;
        const { system = this.system } = components;
        const { repository = this.repository } = components;
        const { iterations = this.iterations } = components;
        const { scenarios = this.scenarios } = components;
        const { hosts = this.hosts } = components;
        const { measurements = this.measurements } = components;
        const { isolatedCpus = this.isolatedCpus } = components;
        const { predictable = this.predictable } = components;
        if (
            this.date === date
            && this.system === system
            && this.repository === repository
            && this.iterations === iterations
            && this.scenarios === scenarios
            && this.hosts === hosts
            && this.measurements === measurements
            && this.isolatedCpus === isolatedCpus
            && this.predictable === predictable
        ) {
            return this;
        }
        return Benchmark.create({
            date,
            system,
            repository,
            iterations,
            scenarios,
            hosts,
            measurements,
            isolatedCpus,
            predictable,
        });
    }

    public merge(other: Benchmark) {
        let date = this.date || other.date;
        if (this.date && other.date && new Date(this.date) < new Date(other.date)) {
            date = other.date;
        }
        let repository: RepositoryComponents | undefined = this.repository || other.repository;
        if (this.repository && other.repository) {
            assertEquals("repository types", this.repository.type, other.repository.type);
            assertEquals("repository urls", this.repository.url, other.repository.url);
            assertEquals("repository branches", this.repository.branch, other.repository.branch);
            assertEquals("repository commits", this.repository.commit, other.repository.commit);
            assertEquals("repository dates", this.repository.date, other.repository.date);
            assertEquals("repository subjects", this.repository.subject, other.repository.subject);
            repository = {
                type: this.repository.type,
                url: this.repository.url,
                branch: this.repository.branch,
                commit: this.repository.commit,
                date: this.repository.date,
                subject: this.repository.subject,
            };
        }
        const iterations = this.iterations === other.iterations ? this.iterations : undefined;
        const scenarios = dedupeBy([...this.scenarios, ...other.scenarios], ["name"]);
        const hosts = dedupeBy([...this.hosts, ...other.hosts], ["name", "version", "arch"]).map(host => ({
            name: host.name,
            version: host.version,
            arch: host.arch,
        }));
        const measurements = Query.from(this.measurements).concat(other.measurements)
            .map(measurement => {
                const hostIndex = hosts.findIndex(host =>
                    new HostPattern(host.name, host.version, host.arch, undefined).match(measurement.host!)
                );
                const scenarioIndex = scenarios.findIndex(scenario =>
                    scenario.name.toLowerCase() === measurement.scenarioName!.toLowerCase()
                );
                return measurement.with({ hostIndex, scenarioIndex });
            })
            .groupBy(m => m.name)
            .map(group => Query.from(group.values).reduce((m1, m2) => m1.merge(m2)))
            .toArray();
        return Benchmark.create({ date, repository, iterations, scenarios, hosts, measurements });

        function assertEquals<T>(fieldName: string, thing: T, other: T) {
            if (thing !== other) {
                throw Error(`Expected both ${fieldName} to be equal, but they were '${thing}' and '${other}'.`);
            }
        }

        function dedupeBy<T>(ts: T[], fields: (keyof T)[]): T[] {
            const result: T[] = [];
            for (const t of ts) {
                let found = false;
                for (const r of result) {
                    if (isEqual(t, r)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    result.push(t);
                }
            }
            return result;

            function isEqual(some: T, other: T) {
                for (const f of fields) {
                    if (some[f] !== other[f]) {
                        return false;
                    }
                }
                return true;
            }
        }
    }

    public static diff(benchmark: Benchmark | undefined, baseline: Benchmark | undefined, midline?: Benchmark) {
        return benchmark && benchmark.diff(baseline, midline);
    }

    public diff(baseline: Benchmark | undefined, midline?: Benchmark) {
        return baseline || midline ? new BenchmarkComparison(this, baseline, midline) : undefined;
    }

    public filter(scenarios: string[], hosts: string[]) {
        let filteredScenarios: Scenario[] | undefined;
        let filteredHosts: Host[] | undefined;
        let filteredMeasurements: Measurement[] | undefined;
        let scenarioMap: Map<number, number> | undefined;
        let hostMap: Map<number, number> | undefined;
        if (scenarios && scenarios.length > 0) {
            filteredScenarios = [];
            scenarioMap = new Map<number, number>();
            const scenarioNames = new Set(scenarios.map(scenario => scenario.toLowerCase()));
            for (let scenarioIndex = 0; scenarioIndex < this.scenarios.length; scenarioIndex++) {
                const scenario = this.scenarios[scenarioIndex];
                if (scenarioNames.size === 0 || scenarioNames.has(scenario.name.toLowerCase())) {
                    const mappedIndex = filteredScenarios.push(scenario) - 1;
                    scenarioMap.set(scenarioIndex, mappedIndex);
                }
            }
        }

        if (hosts && hosts.length > 0) {
            filteredHosts = [];
            hostMap = new Map<number, number>();
            const hostNames = hosts.map(host => HostPattern.parse(host));
            for (let hostIndex = 0; hostIndex < this.hosts.length; hostIndex++) {
                const host = this.hosts[hostIndex];
                if (hostNames.length === 0 || hostNames.some(pattern => pattern.match(host))) {
                    const mappedIndex = filteredHosts.push(host) - 1;
                    hostMap.set(hostIndex, mappedIndex);
                }
            }
        }

        if ((filteredScenarios || filteredHosts) && scenarioMap && hostMap) {
            filteredMeasurements = [];
            for (const measurement of this.measurements) {
                if (
                    !scenarioMap.has(measurement.scenarioIndex!)
                    || !hostMap.has(measurement.hostIndex!)
                ) {
                    continue;
                }

                filteredMeasurements.push(measurement.with({
                    scenarioIndex: scenarioMap.get(measurement.scenarioIndex!),
                    hostIndex: scenarioMap.get(measurement.hostIndex!),
                }));
            }

            return this.with({
                scenarios: filteredScenarios,
                hosts: filteredHosts,
                measurements: filteredMeasurements,
            });
        }

        return this;
    }

    public toJSON(): any {
        return {
            version: this.version,
            date: this.date,
            system: this.system,
            isolatedCpus: this.isolatedCpus,
            predictable: this.predictable,
            repository: this.repository,
            iterations: this.iterations,
            scenarios: this.scenarios,
            hosts: this.hosts,
            measurements: this.measurements,
        };
    }

    public toString() {
        return JSON.stringify(this, /*replacer*/ undefined, /*space*/ "  ");
    }

    public async saveAsync(file: string, options?: AzureStorageOptions) {
        if (blobPrefixRegExp.test(file)) {
            const blobService = getBlobService(options);
            const blobContainer = getBlobContainer(options);
            return this.saveBlobAsync(blobService, blobContainer, file.substr(5));
        }

        await fs.promises.writeFile(file, this.toString());
    }

    public async saveBlobAsync(service: BlobServiceClient, container: string, file: string) {
        const containerClient = service.getContainerClient(container);
        await containerClient.createIfNotExists();
        await containerClient.getBlockBlobClient(file).upload(this.toString(), this.toString().length);
    }
}
