import { CommandMap } from "@ts-perf/api";

import * as analyze from "./analyze";
import * as benchmark from "./benchmark";
import * as heap from "./heap";
import * as host from "./host";
import * as merge from "./merge";
import * as patch from "./patch";
import * as profile from "./profile";
import * as scenario from "./scenario";
import * as trace from "./trace";

export { analyze, AnalyzeOptions } from "./analyze";
export { benchmark, BenchmarkOptions } from "./benchmark";
export { heap, HeapProfilerOptions } from "./heap";
export {
    configureHost,
    ConfigureHostOptions,
    installHost,
    InstallHostOptions,
    listHosts,
    ListHostsOptions,
    uninstallHost,
    UninstallHostOptions,
} from "./host";
export { merge, MergeOptions } from "./merge";
export { patch, PatchOptions } from "./patch";
export { profile, ProfilerOptions } from "./profile";
export {
    addScenario,
    AddScenarioOptions,
    configureScenario,
    ConfigureScenarioOptions,
    deleteScenario,
    DeleteScenarioOptions,
    ListScenarioOptions,
    listScenarios,
} from "./scenario";
export { trace, TraceOptions } from "./trace";

export function activate(commands: CommandMap) {
    scenario.registerCommands(commands);
    host.registerCommands(commands);
    benchmark.registerCommands(commands);
    profile.registerCommands(commands);
    analyze.registerCommands(commands);
    heap.registerCommands(commands);
    patch.registerCommands(commands);
    trace.registerCommands(commands);
    merge.registerCommands(commands);
    commands.install = { aliasFor: { command: ["host", "install"] }, visibility: "advanced" };
    commands.uninstall = { aliasFor: { command: ["host", "uninstall"] } };
    commands.config = { aliasFor: { command: ["host", "config"] } };
}
