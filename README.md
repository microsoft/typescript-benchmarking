# typescript-benchmarking

This repo contains the infrastructure for TypeScript's benchmarking system, including build scripts
and the `ts-perf` CLI tool.

## Generating a PGO profile

Run the **Generate PGO profile** GitHub Actions workflow manually with a TypeScript branch, tag,
or commit in `microsoft/TypeScript` (default: `main`). The ref must contain the native compiler
in `tsc/`. The workflow builds a non-PGO seed with that revision's Go version and external library
files, then prepares the training projects using their existing sandboxed benchmark setup scripts.

Training covers VS Code, Sentry, Bluesky, t3code server and web, MUI docs, ArkType, Webpack,
the Strada source build, Effect, TanStack Router, and class-transformer. There is no separate
t3code web scenario; it reuses the server scenario's checkout. XState remains an evaluation holdout.
Scenario setup scripts determine project revisions; unpinned revisions are resolved during setup
and recorded in the artifact. The Strada workload uses the original TypeScript repository's
`strada` branch, independently of the native compiler ref.

Each workload gets an unprofiled preflight compilation followed by one CPU-profiled compilation.
Both emit from scratch with diagnostic reporting disabled to avoid profiling forced garbage
collections. Emit overrides enable JavaScript/declaration output where appropriate; TanStack
declaration emit is disabled because its test exports include a cyclic inferred type.
Existing TypeScript diagnostics are logged and recorded, and profiling must preserve both
diagnostics and emitted bytes. Compiler crashes, missing outputs, or missing profiles fail the job.

Download the **default-pgo** artifact for `default.pgo`, its SHA-256 and provenance in `manifest.json`,
and the per-workload profiles and logs. All twelve CPU profiles are merged with `go tool pprof -proto`,
without normalization or reweighting, and validated with Go's PGO preprocessor.
The workflow does not commit the profile or push a branch.

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
