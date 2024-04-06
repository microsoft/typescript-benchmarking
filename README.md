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
