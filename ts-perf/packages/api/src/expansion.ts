import * as path from "node:path";

import { TempDirectories } from "@ts-perf/core";

import { Host, Scenario } from "./model";
import { CompilerOptions, StartupOptions, TSServerOptions } from "./options";

export abstract class ExpansionProvider {
    static getProviders(
        config?: {
            runner?:
                | { kind: "tsserver"; options: TSServerOptions; }
                | { kind: "tsc"; options: CompilerOptions; }
                | { kind: "startup"; options: StartupOptions; };
            temp?: TempDirectories;
            scenario?: Scenario;
            host?: Host;
        },
    ) {
        const providers = new ExpansionProviderSet();
        providers.add(new CommonExpansionProvider());
        if (config) {
            if (config.runner) {
                switch (config.runner.kind) {
                    case "tsc":
                        providers.add(new CompilerOptionsExpansionProvider(config.runner.options));
                        break;
                    case "tsserver":
                        providers.add(new TSServerOptionsExpansionProvider(config.runner.options));
                        break;
                }
            }
            if (config.temp) providers.add(new TempDirectoriesExpansionProvider(config.temp));
            if (config.scenario) providers.add(new ScenarioExpansionProvider(config.scenario));
            if (config.host) providers.add(new HostExpansionProvider(config.host));
        }
        return providers;
    }
    abstract expand(name: string): string | undefined;
}

export class CommonExpansionProvider extends ExpansionProvider {
    expand(name: string) {
        switch (name) {
            case "hosts":
            case "hostsdir":
            case "hostsdirectory":
                return Host.hostsDirectory;
        }
        return undefined;
    }
}

export class CompilerOptionsExpansionProvider extends ExpansionProvider {
    public options: CompilerOptions;

    constructor(options: CompilerOptions) {
        super();
        this.options = options;
    }

    expand(name: string) {
        switch (name) {
            case "suite":
            case "suitedir":
            case "suitedirectory":
                return this.options.suite;
            case "tsc":
                return this.options.tsc;
            case "typescript":
            case "typescriptdir":
            case "typescriptdirectory":
                return this.options.tsc && path.dirname(this.options.tsc);
        }

        return undefined;
    }
}

export class TSServerOptionsExpansionProvider extends ExpansionProvider {
    public options: TSServerOptions;

    constructor(options: TSServerOptions) {
        super();
        this.options = options;
    }

    expand(name: string) {
        switch (name) {
            case "suite":
            case "suitedir":
            case "suitedirectory":
                return this.options.suite;
            case "tsserver":
                return this.options.tsserver;
            case "typescript":
            case "typescriptdir":
            case "typescriptdirectory":
                return this.options.tsserver && path.dirname(this.options.tsserver);
        }

        return undefined;
    }
}

export class TempDirectoriesExpansionProvider extends ExpansionProvider {
    public directories: TempDirectories;

    constructor(directories: TempDirectories) {
        super();
        this.directories = directories;
    }

    expand(name: string) {
        switch (name) {
            case "out":
            case "outdir":
            case "outdirectory":
                return this.directories.outDirectory;
            case "sourceroot":
            case "sourcerootdir":
            case "sourcerootdirectory":
                return this.directories.sourcerootDirectory;
            case "maproot":
            case "maprootdir":
            case "maprootdirectory":
                return this.directories.maprootDirectory;
        }
        return undefined;
    }
}

export class ScenarioExpansionProvider extends ExpansionProvider {
    public scenario: Scenario;
    constructor(scenario: Scenario) {
        super();
        this.scenario = scenario;
    }

    expand(name: string) {
        switch (name) {
            case "scenariodir":
            case "scenariodirectory":
                return this.scenario.configDirectory;
        }

        return undefined;
    }
}

export class HostExpansionProvider extends ExpansionProvider {
    public host: Host;
    constructor(host: Host) {
        super();
        this.host = host;
    }

    expand(name: string) {
        switch (name) {
            case "hostdir":
            case "hostdirectory":
                return this.host.configDirectory;
        }

        return undefined;
    }
}

export class ExpansionProviderSet extends Set<ExpansionProvider> {
    expand(value: string) {
        return value.replace(/\$\{([^}]+)\}/g, (_: string, name: string) => {
            name = name.toLowerCase();
            let value: string | undefined;
            for (const provider of this) {
                value = provider.expand(name);
                if (value !== undefined) return value;
            }
            return "";
        });
    }
}

export class CommandLineArgumentsBuilder {
    public expansionProviders: ExpansionProviderSet;
    public cmd: string | undefined;
    public args: string[] = [];
    public hasBuild = false;

    constructor(
        expansionProviders: Iterable<ExpansionProvider>,
        executable?: string | Host,
        exposeGc = true,
        cpus?: string,
        predictable?: boolean,
    ) {
        this.expansionProviders = new ExpansionProviderSet(expansionProviders);
        if (typeof executable === "string") {
            this.cmd = this.expand(executable);
        }
        else if (executable && executable.executableFile) {
            this.cmd = this.expand(executable.executableFile);
            if (executable.name === "node" && exposeGc) {
                this.add("--expose-gc");
            }
            if (executable.name === "node" && predictable) {
                this.add("--predictable");
            }
            if (executable.args) {
                this.addRange(executable.args);
            }
        }

        if (cpus) {
            if (process.platform !== "linux") {
                throw new Error("--cpus only works on Linux");
            }
            const newArgs = ["-c", cpus];
            if (this.cmd) {
                newArgs.push(this.cmd);
            }
            newArgs.push(...this.args);
            this.cmd = "taskset";
            this.args = newArgs;
        }
    }

    add(...args: string[]) {
        return this.addRange(args);
    }

    addSwitch(name: string, value: boolean) {
        if (name.startsWith("--")) name = name.slice(2);
        if (name.startsWith("no-")) name = name.slice(3), value = !value;
        return this.add(value ? `--${name}` : `--no-${name}`);
    }

    addIf(test: boolean, ...args: string[]) {
        if (test) this.addRange(args);
        return this;
    }

    addOptional(arg: string, value: string | undefined) {
        if (value !== undefined) {
            value = this.expand(value);
            if (value !== undefined) {
                this.args.push(arg, value);
            }
        }
        return this;
    }

    addRange(args: Iterable<string> | undefined) {
        if (args) {
            for (const arg of args) {
                this.args.push(this.expand(arg));
            }
        }
        return this;
    }

    addCompilerOptions(options: CompilerOptions, scenario: Scenario) {
        this.hasBuild =
            -1 !== (scenario?.args ? Math.max(scenario.args.indexOf("-b"), scenario.args.indexOf("--build")) : -1);
        if (!this.hasBuild) {
            this.add(
                "--target",
                "es5",
                "--module",
                "amd",
            );
            if (scenario?.singleFileOutput) {
                this.add("--outfile", "${outDirectory}/out.js");
            }
            else {
                this.add("--outdir", "${outDirectory}");
            }
            if (options.full) {
                this.add(
                    "--declaration",
                    "--sourcemap",
                    "--removeComments",
                    "--mapRoot",
                    "${maprootDirectory}",
                    "--sourceRoot",
                    "${sourcerootDirectory}",
                );
            }
        }

        this.addRange(scenario?.args);
        this.addRange(options.compilerOptions);

        return this;
    }

    toString() {
        let text = "";
        if (this.cmd) {
            text += this.cmd;
        }
        if (this.args.length > 0) {
            if (text) {
                text += " ";
            }
            text += this.args.join(" ");
        }
        return text;
    }

    private expand(value: string) {
        return this.expansionProviders.expand(value);
    }
}
