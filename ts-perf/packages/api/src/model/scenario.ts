import * as fs from "node:fs";
import * as path from "node:path";

import { localScenariosDirectory } from "@ts-perf/core";

import { StringComparer } from "../utils";
import { TSServerConfig } from "./tsserverconfig";

const cachedScenarios = new Map<string, Scenario[]>();

export type ScenarioKind = "tsserver" | "tsc" | "startup";

export interface ScenarioComponents {
    name: string;
    kind: ScenarioKind;
    args?: string[];
    default?: boolean;
    disabled?: boolean;
    platforms?: string[];
    singleFileOutput?: boolean;
    configFile: string;
    tsserverConfig?: TSServerConfig;
}

export class Scenario {
    public readonly name: string;
    public readonly kind: ScenarioKind;
    public readonly args?: string[];
    public readonly default?: boolean;
    public readonly disabled?: boolean;
    public readonly platforms?: string[];
    public readonly singleFileOutput?: boolean;
    public readonly configFile: string;
    public readonly tsserverConfig?: TSServerConfig;

    public isLocal?: boolean;
    public isOverriding?: boolean;

    constructor(
        name: string,
        kind: ScenarioKind,
        configFile: string,
        args?: string[],
        options?: {
            default?: boolean;
            disabled?: boolean;
            platforms?: string[];
            singleFileOutput?: boolean;
            tsserverConfig?: TSServerConfig;
        },
    ) {
        if (kind === "tsserver" && !options?.tsserverConfig) {
            throw new Error(`Creating scenario '${name}': expected a tsserver config for tsserver scenario.`);
        }
        this.name = name;
        this.kind = kind;
        this.args = args;
        this.default = options && options.default;
        this.disabled = options && options.disabled;
        this.platforms = options && options.platforms;
        this.singleFileOutput = options && options.singleFileOutput;
        this.configFile = configFile;
        this.tsserverConfig = options && options.tsserverConfig;
    }

    public get supported() {
        return !this.platforms
            || this.platforms.length === 0
            || this.platforms.indexOf(process.platform) !== -1;
    }

    public get configDirectory() {
        return this.configFile && path.dirname(this.configFile);
    }

    public static create(components: ScenarioComponents) {
        return new Scenario(components.name, components.kind, components.configFile, components.args, components);
    }

    public static parse(text: string) {
        return this.create(JSON.parse(text) as ScenarioComponents);
    }

    public static async loadAsync(file: string) {
        const text = await fs.promises.readFile(file, "utf8");
        return this.parse(text).with({ configFile: file });
    }

    /**
     * Produces a list of resolved scenario dirs in precedence order.
     */
    public static getScenarioConfigDirs(scenarioConfigDirs: string[] | undefined) {
        const dirs = [localScenariosDirectory, ...(scenarioConfigDirs ?? [])];
        return [...new Set(dirs.map(dir => path.resolve(dir)).reverse())];
    }

    public static async getAvailableScenarios(
        scenarioConfigDirs: string[] | undefined,
        options?: { ignoreCache?: boolean; },
    ) {
        scenarioConfigDirs = this.getScenarioConfigDirs(scenarioConfigDirs);

        const scenarios: Scenario[] = [];
        for (const scenarioConfigDir of scenarioConfigDirs) {
            scenarioLoop:
            for (const scenario of await this.getAvailableScenariosForDir(scenarioConfigDir, options)) {
                for (const other of scenarios) {
                    if (other.name === scenario.name) {
                        scenario.isOverriding = true;
                        console.log(
                            `Warning: scenario '${scenario.configFile}' is overriding ${other.configFile}.`,
                        );
                        continue scenarioLoop;
                    }
                }
                scenarios.push(scenario);
            }
        }
        return scenarios;
    }

    private static async getAvailableScenariosForDir(
        scenarioConfigDir: string,
        options?: { ignoreCache?: boolean; },
    ) {
        let scenarios = cachedScenarios.get(scenarioConfigDir);
        if (!scenarios || options?.ignoreCache) {
            scenarios = [];
            if (fs.existsSync(scenarioConfigDir)) {
                for (const container of await fs.promises.readdir(scenarioConfigDir)) {
                    const file = path.join(scenarioConfigDir, container, "scenario.json");
                    try {
                        const scenario = await Scenario.loadAsync(file);
                        scenario.isLocal = true;
                        scenarios.push(scenario);
                    }
                    catch (e) {
                    }
                }
            }
            cachedScenarios.set(scenarioConfigDir, scenarios);
        }
        return scenarios.slice();
    }

    public static async getDefaultScenarios(
        scenarioConfigDirs: string[] | undefined,
        options?: { includeUnsupported?: boolean; },
    ) {
        const availableScenarios = await this.getAvailableScenarios(scenarioConfigDirs);
        return availableScenarios
            .filter(scenario =>
                !scenario.disabled
                && (scenario.supported || (options && options.includeUnsupported))
            );
    }

    public static async findMatchingScenarios(
        scenarioConfigDirs: string[] | undefined,
        scenarios: string[],
        kind?: ScenarioKind,
        options?: { includeUnsupported?: boolean; },
    ) {
        const availableScenarios = await this.getAvailableScenarios(scenarioConfigDirs);
        return availableScenarios
            .filter(scenario =>
                (scenario.supported || (options && options.includeUnsupported))
                && scenarios.some(scenarioName => StringComparer.caseInsensitive.equals(scenarioName, scenario.name))
                && (!kind || scenario.kind === kind)
            );
    }

    public static async findScenarios(
        scenarioConfigDirs: string[] | undefined,
        scenarios?: string[],
        kind?: ScenarioKind,
        options?: { includeUnsupported?: boolean; },
    ) {
        if (scenarios && scenarios.length) {
            return await this.findMatchingScenarios(scenarioConfigDirs, scenarios, kind, options);
        }
        else {
            const defaultScenarios = await this.getDefaultScenarios(scenarioConfigDirs, options);
            return kind ? defaultScenarios.filter(scenario => scenario.kind === kind) : defaultScenarios;
        }
    }

    public static async findScenario(
        scenarioConfigDirs: string[] | undefined,
        scenario: string,
        kind?: ScenarioKind,
        options?: { includeUnsupported?: boolean; },
    ) {
        const matchingScenarios = await this.findScenarios(
            scenarioConfigDirs,
            scenario ? [scenario] : undefined,
            kind,
            options,
        );
        if (matchingScenarios.length === 0) {
            return undefined;
        }
        else if (matchingScenarios.length === 1) {
            return matchingScenarios[0];
        }

        let firstDefaultScenario: Scenario | undefined;
        let firstEnabledScenario: Scenario | undefined;
        let firstScenario: Scenario | undefined;
        for (const scenario of matchingScenarios) {
            if (!firstScenario) firstScenario = scenario;
            if (scenario.default && !firstDefaultScenario) firstDefaultScenario = scenario;
            if (!scenario.disabled && !firstEnabledScenario) firstEnabledScenario = scenario;
            if (firstScenario && firstDefaultScenario && firstEnabledScenario) break;
        }

        return firstDefaultScenario || firstEnabledScenario || firstScenario;
    }

    public getComponents(): ScenarioComponents {
        return {
            name: this.name,
            kind: this.kind,
            args: this.args && this.args.slice(),
            default: this.default,
            disabled: this.disabled,
            platforms: this.platforms && this.platforms.slice(),
            configFile: this.configFile,
        };
    }

    public async saveAsync(configFile: string) {
        await fs.promises.writeFile(configFile, JSON.stringify(this, undefined, "  "), "utf8");
        cachedScenarios.clear();
    }

    public with(components: Partial<ScenarioComponents>) {
        const { name = this.name } = components;
        const { kind = this.kind } = components;
        const { args = this.args } = components;
        const { default: default_ = this.default } = components;
        const { disabled = this.disabled } = components;
        const { platforms = this.platforms } = components;
        const { singleFileOutput = this.singleFileOutput } = components;
        const { configFile = this.configFile } = components;
        const { tsserverConfig = this.tsserverConfig } = components;
        if (
            this.name === name
            && this.kind === kind
            && this.args === args
            && this.default === default_
            && this.disabled === disabled
            && this.platforms === platforms
            && this.singleFileOutput === singleFileOutput
            && this.configFile === configFile
        ) {
            return this;
        }

        return new Scenario(name, kind, configFile, args, {
            default: default_,
            disabled,
            platforms,
            singleFileOutput,
            tsserverConfig,
        });
    }

    public toString() {
        return this.name;
    }

    public toJSON(): any {
        return {
            name: this.name,
            kind: this.kind,
            args: this.args && this.args.slice(),
            default: this.default,
            disabled: this.disabled,
            platforms: this.platforms && this.platforms.slice(),
            singleFileOutput: this.singleFileOutput,
            tsserverConfig: this.tsserverConfig,
        };
    }
}
