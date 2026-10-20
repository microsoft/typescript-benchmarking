# typescript-benchmarking

This repo contains the infrastructure for TypeScript's benchmarking system, including build scripts
and the `ts-perf` CLI tool.

## Adding a benchmark

Public benchmarks are stored in the `cases` directory.

The simplest thing to do is to copy another benchmark; `cases/scenarios/vscode` is a good template.

Each benchmark consists of:

- `cases/scenarios/<name>/scenario.json` - This is JSON file which describes what `ts-perf` will run.
- `cases/scenarios/<name>/setup.sh` - This is an optional script that CI will run before benchmarking for setting up the benchmark.
  This is where you would clone repos, install dependencies, etc, whatever is needed to run `tsc`.
- `cases/solutions/<name>` (or an ignored dir of the same name in `cases/solutions/.gitignore`) - This is where the source code for the benchmark is stored.
  This may be code that's checked in the repo, but preferably the directory is `.gitignore`'d and `setup.sh` script clones code here.

After these files are created, they must be added to `scenarioConfig` in `scripts/src/setupPipeline.ts` to be run in CI.

> [!NOTE]
> Benchmark capacity is limited; we may not accept all benchmarks or run them automatically in CI.

### Adding an API benchmark

API benchmarks time an external program that uses the TypeScript 7 JS API. `cases/scenarios/vscode-languageserver-api-metamodel` is a good template.

In `scenario.json`, set `"kind": "api"` and set `args` to a Node script (relative to the scenario directory) followed by its arguments. `${typescriptDirectory}` expands to the built compiler. The script runs in `cases/solutions/<name>` and is timed from start to finish. It should point the program at the built `typescript` package, run it, and exit nonzero if the output is wrong.

API benchmarks use Node hosts installed with `ts-perf host install`, not the ambient Node installation. The runner sets `TSPERF_NPM_CLI` to the selected host's bundled npm CLI; `run("npm", ...)` in `cases/api/utils.mjs` invokes it with the selected Node, preserving upstream npm scripts without using ambient package-manager shims.

`ts-perf` sets `TS_API_TIMING_DIR`, and each API client writes timing data there when it is closed. A run that produces no timing data fails, so both compared compiler commits must include timing support (microsoft/TypeScript#64846).

To run the benchmark in CI, add it to `allScenarios` in `scripts/src/setupPipeline.ts` with `kind: "api"` and `runIn: RunType.None`, then request the `api` preset.

#### API allocations and memory

Use `ts-perf benchmark api --apiMemory` (or the CI preset `api apiMemory`) to collect client/server memory.
This requires additional compiler support for `TS_API_MEMORY_DIR`; timing-only candidates remain supported without
`--apiMemory`, but a requested memory pass fails if dumps or supported counters are missing. Run both baseline
and candidate with the same option; comparing memory-enabled and timing-only reports is rejected.

The runner first completes ordinary timing iterations with memory collection disabled, then repeats the same
consumer command, candidate, installed Node host and bundled npm in separate memory-only iterations. Both passes
use the requested iteration/warmup counts, but memory passes never contribute wall-time or timing-counter samples.
The runner does not force GC. CI's API preset pins Node 24.21.0.

Memory dumps use schema version 1 and contain `client.pid`, `client.heapUsedBytes`, `client.peakRSSBytes`,
`client.sampling.{id,intervalBytes,allocatedBytes}` and
`server.{pid,heapAllocBytes,totalAllocBytes,peakRSSBytes}`. These are process-wide, not per-request or per-client:

| Metric                                 | Meaning and aggregation                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client JS allocated (sampled estimate) | V8 inspector allocation sampling at a fixed 32 KiB interval, including allocations collected by **both major and minor GC**. Shared overlapping-client sampling windows are counted once (maximum cumulative estimate per window ID); disjoint windows are summed. This is not an exact JS allocation total, does not include all native/external allocations, and includes other JS activity in the API client's process during the profiling window. |
| Client/server heap at close            | JS `heapUsed` / Go `HeapAlloc` snapshots, including uncollected garbage, not live-after-GC or peak heap. Maximum observed snapshot per PID, then summed across distinct processes; **not a simultaneous total**.                                                                                                                                                                                                                                       |
| Client/server lifetime peak RSS        | Maximum single-process lifetime high-water RSS, in bytes, across the corresponding PIDs; **not a sum of process peaks**. May include startup before API profiling.                                                                                                                                                                                                                                                                                     |
| Server Go allocated (exact cumulative) | Go runtime `TotalAlloc`, maximum per server PID then summed. Cumulative allocated Go heap bytes since process startup, not retained memory or all OS/native allocations.                                                                                                                                                                                                                                                                               |

Only processes hosting an API client or its server contribute; npm and wrapper processes without API clients do
not. JS heap/allocation counters cover the main V8 isolate, not worker isolates or native/external allocations;
RSS covers the entire process. Collection from a worker thread fails explicitly.
Client process counts and server process counts are reported separately. Snapshot and allocation measurements
include profiling overhead; the sampling window starts with the first overlapping API client and ends when the last
closes, rather than covering the entire consumer command. Unsupported sampling or peak-RSS collection fails the
memory pass instead of reporting zeros. Sampling noise and allocations before client creation remain limitations.

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.opensource.microsoft.com.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
