import * as fs from "node:fs";
import * as path from "node:path";

import { HashMap } from "@esfx/collections-hashmap";
import { HashSet } from "@esfx/collections-hashset";
import { containsPath, localScenariosDirectory, PathComparer, StringComparer } from "@ts-perf/core";

import { TSServerConfig } from "./tsserverconfig";

const cachedScenarios = new HashMap<string, Scenario[]>(PathComparer.fileSystem);

export type ScenarioKind = "tsserver" | "tsc" | "startup";

export interface TscConfig {
    usePublicApi?: boolean;
}

export interface ScenarioComponents {
    name: string;
    kind: ScenarioKind;
    args?: readonly string[];
    default?: boolean;
    disabled?: boolean;
    platforms?: readonly string[];
    configFile: string;
    tsserverConfig?: TSServerConfig;
    tscConfig?: TscConfig;
}

export class Scenario {
    public readonly name: string;
    public readonly kind: ScenarioKind;
    public readonly args?: readonly string[];
    public readonly default?: boolean;
    public readonly disabled?: boolean;
    public readonly platforms?: readonly string[];
    public readonly configFile: string;
    public readonly tsserverConfig?: TSServerConfig;
    public readonly tscConfig?: TscConfig;

    public isLocal?: boolean;
    public isOverriding?: boolean;

    constructor(
        name: string,
        kind: ScenarioKind,
        configFile: string,
        args?: readonly string[],
        options?: {
            default?: boolean;
            disabled?: boolean;
            platforms?: readonly string[];
            tsserverConfig?: TSServerConfig;
            tscConfig?: TscConfig;
        },
    ) {
        if (kind === "tsserver" && !options?.tsserverConfig) {
            throw new Error(`Creating scenario '${name}': expected a tsserver config for tsserver scenario.`);
        }
        this.name = name;
        this.kind = kind;
        this.args = args;
        this.default = options?.default;
        this.disabled = options?.disabled;
        this.platforms = options?.platforms;
        this.configFile = configFile;
        this.tsserverConfig = options?.tsserverConfig;
        this.tscConfig = options?.tscConfig;
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
        const parsed = JSON.parse(text) as Omit<ScenarioComponents, "configFile">;
        return this.create({ configFile: "", ...parsed });
    }

    public static async loadAsync(file: string) {
        const text = await fs.promises.readFile(file, "utf8");
        return this.parse(text).with({ configFile: file });
    }

    /**
     * Produces a list of resolved scenario dirs in precedence order.
     */
    public static getScenarioDirs(scenarioDir: string | undefined) {
        if (scenarioDir) {
            scenarioDir = path.resolve(scenarioDir);
            if (!PathComparer.fileSystem.equals(scenarioDir, localScenariosDirectory)) {
                return [scenarioDir, localScenariosDirectory];
            }
        }
        return [localScenariosDirectory];
    }

    public static async getAvailableScenarios(
        options?: {
            scenarioDir?: string | undefined;
            ignoreCache?: boolean | undefined;
        },
    ) {
        const scenarioDirs = this.getScenarioDirs(options?.scenarioDir);
        const scenariosByName = new HashMap<string, Scenario>(StringComparer.caseInsensitive);
        const scenarios: Scenario[] = [];
        for (const scenarioDir of scenarioDirs) {
            for (const scenario of await this.getAvailableScenariosForDir(scenarioDir, options)) {
                const existingScenario = scenariosByName.get(scenario.name);
                if (existingScenario) {
                    scenario.isOverriding = true;
                    console.log(
                        `Warning: scenario '${scenario.configFile}' is overrides ${existingScenario.configFile}.`,
                    );
                }
                else {
                    scenariosByName.set(scenario.name, scenario);
                }
                scenarios.push(scenario);
            }
        }
        return scenarios;
    }

    private static async getAvailableScenariosForDir(
        scenarioDir: string,
        options?: { ignoreCache?: boolean; },
    ) {
        const isLocal = containsPath(localScenariosDirectory, scenarioDir, StringComparer.fileSystem);
        let scenarios = cachedScenarios.get(scenarioDir);
        if (!scenarios || options?.ignoreCache) {
            scenarios = [];
            if (fs.existsSync(scenarioDir)) {
                for (const container of await fs.promises.readdir(scenarioDir)) {
                    const file = path.join(scenarioDir, container, "scenario.json");
                    try {
                        const scenario = await Scenario.loadAsync(file);
                        scenario.isLocal = isLocal;
                        scenarios.push(scenario);
                    }
                    catch (e) {
                    }
                }
            }
            cachedScenarios.set(scenarioDir, scenarios);
        }
        return scenarios.slice();
    }

    public static async findScenarios(
        scenarios?: string[],
        options?: {
            scenarioDir?: string | undefined;
            kind?: ScenarioKind | undefined;
            includeUnsupported?: boolean | undefined;
            includeDisabled?: boolean | undefined;
        },
    ) {
        const scenarioSet = scenarios?.length ? new HashSet(scenarios, StringComparer.caseInsensitive) : undefined;
        const availableScenarios = await this.getAvailableScenarios({ scenarioDir: options?.scenarioDir });
        return availableScenarios.filter(scenario =>
            (!scenarioSet || scenarioSet.has(scenario.name))
            && (!options?.kind || scenario.kind === options.kind)
            && (!!options?.includeDisabled || !!scenarioSet || !scenario.disabled)
            && (!!options?.includeUnsupported || scenario.supported)
        );
    }

    public static async findScenario(
        scenario: string,
        options?: {
            scenarioDir?: string | undefined;
            kind?: ScenarioKind | undefined;
            includeUnsupported?: boolean | undefined;
            includeDisabled?: boolean | undefined;
        },
    ) {
        const matchingScenarios = await this.findScenarios([scenario], options);
        if (matchingScenarios.length === 0) {
            return undefined;
        }
        if (matchingScenarios.length === 1) {
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
            args: this.args?.slice(),
            default: this.default,
            disabled: this.disabled,
            platforms: this.platforms?.slice(),
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
        const { configFile = this.configFile } = components;
        const { tsserverConfig = this.tsserverConfig } = components;
        const { tscConfig = this.tscConfig } = components;
        if (
            this.name === name
            && this.kind === kind
            && this.args === args
            && this.default === default_
            && this.disabled === disabled
            && this.platforms === platforms
            && this.configFile === configFile
        ) {
            return this;
        }

        return new Scenario(name, kind, configFile, args, {
            default: default_,
            disabled,
            platforms,
            tsserverConfig,
            tscConfig,
        });
    }

    public toString() {
        return this.name;
    }

    public toJSON(): Omit<ScenarioComponents, "configFile"> {
        return {
            name: this.name,
            kind: this.kind,
            args: this.args?.slice(),
            default: this.default,
            disabled: this.disabled,
            platforms: this.platforms?.slice(),
            tsserverConfig: this.tsserverConfig,
            tscConfig: this.tscConfig,
        };
    }
}
