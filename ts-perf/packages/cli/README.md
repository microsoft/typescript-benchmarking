# TypeScript Performance Tool `ts-perf`

`ts-perf` is a suite of performance testing tools designed for analyzing and benchmarking performance for the TypeScript compiler and server.

## Usage

```
usage: ts-perf <command> [options]

ts-perf command line utility

commands:
 scenario      Manage performance scenarios.
 host          Manage test hosts.
 list          Lists available scenarios and hosts.
 benchmark     Load or run a benchmark.
 profile       Profile the compiler.
 analyze       Run queries against a .cpuprofile.
 heap          Generate heap snapshots of the compiler.
 patch         Patch a benchmark.
 trace         Trace deoptimizations in NodeJS (v8).
 uninstall     Uninstall a NodeJS test host. [alias for: ts-perf host uninstall]
 config        Changes configuration options for hosts. [alias for: ts-perf host config]

general options:
 -q --quiet    Only prints minimal output information. [alias for: --log-level quiet]
 -v --verbose  Prints detailed diagnostic information. [alias for: --log-level verbose]
 -h --help     Prints this message.
 -V --version  Prints the version for the package.

remarks:
 For advanced options, type: 'ts-perf help --advanced'
 For full help, type: 'ts-perf help --full'
```

## Common Uses

- Install a NodeJS runtime:
  ```powershell
  ts-perf host install --host node@11.1 --config default=true
  ```
- Run a benchmark
  - Run a compiler benchmark (must be run within the TypeScript repo unless the `--builtDir` and `--suite` options are provided):
    ```powershell
    # All compiler scenarios and default hosts
    ts-perf benchmark tsc --save /path/to/file.benchmark

    # A specific scenario and host
    ts-perf benchmark tsc --scenario Monaco --host node@11 --save /path/to/file.benchmark

    # Compare against a baseline
    ts-perf benchmark tsc --baseline /path/to/baseline.benchmark --save /path/to/file.benchmark
    ```
  - Run a tsserver benchmark (must be run within the TypeScript repo unless the `--builtDir` and `--suite` options are provided):
    ```powershell
    # All tsserver scenarios and default hosts
    ts-perf benchmark tsserver --save /path/to/file.benchmark

    # A specific scenario and host
    ts-perf benchmark tsserver --scenario xstateTSServer --host node@11 --save /path/to/file.benchmark

    # Compare against a baseline
    ts-perf benchmark tsserver --baseline /path/to/baseline.benchmark --save /path/to/file.benchmark
    ```
- Profile the commandline compiler (must be run within the TypeScript repo unless the `--builtDir` and `--suite` options are provided):
  ```powershell
  ts-perf profile --scenario Monaco --host node@11 --out /path/to/file.cpuprofile
  ```
- Launch the `analyze` REPL:
  ```powershell
  # Analyze a .cpuprofile file (generated from `ts-perf profile`)
  ts-perf analyze /path/to/file.cpuprofile
  ```
- Run `analyze` with a saved `.jsql` file:
  ```powershell
  ts-perf analyze /path/to/file.cpuprofile --input /path/to/query.jsql
  ```

## The `analyze` REPL

The `ts-perf analyze` command parses the provided `.cpuprofile` file and provides a REPL that can be used to run ad-hoc queries against the file:

```
C:\dev\TypeScript> ts-perf analyze /path/to/file.cpuprofile
jsql repl - Use linq syntax and JavaScript expressions
for more information use: .help, .usage, .table, .type
>
```

Inside the repl, use the `.table` command for a list of the available data sets, and the `.type` command to see the structure of
the types for each table.

Only a subset of JavaScript expressions are supported (no `function` or `class`, and no statements), but you can also use [LINQ-like syntax](#linq-like-generator-comprehensions-jsql) for queries.

### JavaScript Expressions

When a `.cpuprofile` file is loaded, the REPL provides access to a number of [Query](https://rbuckton.github.io/iterable-query/classes/_iterable_query_.query.html) objects that can be used to
evaluate queries against various views of the file:

```
> nodes
... .where(node => node.isUserCode)
... .orderByDescending(node => node.selfTime)
┌──────────────────────────────────────────────────────────────────────────────────┬─────────────────┬─────────────────┐
│ function                                                                         │       self time │      total time │
├──────────────────────────────────────────────────────────────────────────────────┼─────────────────┼─────────────────┤
│ computeLineStarts (C:/dev/typescript/src/compiler/scanner.ts:311:38)             │ 37.0 ms   0.23% │ 37.0 ms   0.23% │
│ computeLineStarts (C:/dev/typescript/src/compiler/scanner.ts:311:38)             │ 28.3 ms   0.18% │ 28.3 ms   0.18% │
│ isRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11642:33)                 │ 27.2 ms   0.17% │ 38.1 ms   0.24% │
│ checkTypeRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11507:36)          │ 25.0 ms   0.16% │ 38.1 ms   0.24% │
│ getLateBoundSymbol (C:/dev/typescript/src/compiler/checker.ts:6513:36)           │ 22.8 ms   0.14% │ 22.8 ms   0.14% │
│ updateLineCountAndPosFor (C:/dev/typescript/src/compiler/utilities.ts:3150:42)   │ 22.8 ms   0.14% │ 25.0 ms   0.16% │
│ (anonymous function) (<inlined>)                                                 │ 18.5 ms   0.12% │ 18.5 ms   0.12% │

... (omitted for brevity) ...

│ getDeclarationName (C:/dev/typescript/src/compiler/binder.ts:253:36)             │  9.8 ms   0.06% │  9.8 ms   0.06% │
│ checkTypeRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11507:36)          │  9.8 ms   0.06% │ 23.9 ms   0.15% │
└──────────────────────────────────────────────────────────────────────────────────┴─────────────────┴─────────────────┘
Only showing 50 of 117425 values returned.
```

### LINQ-like Generator Comprehensions (JSQL)

```
> from node of nodes
... where node.isUserCode
... orderby node.selfTime descending
... select node
duration (total): 16,331.8 ms, 14539 samples
duration (selection): 13,968.8 ms, 12839 samples (88.31% of total)
┌──────────────────────────────────────────────────────────────────────────────────┬─────────────────┬─────────────────┐
│ function                                                                         │       self time │      total time │
├──────────────────────────────────────────────────────────────────────────────────┼─────────────────┼─────────────────┤
│ computeLineStarts (C:/dev/typescript/src/compiler/scanner.ts:311:38)             │ 37.0 ms   0.23% │ 37.0 ms   0.23% │
│ computeLineStarts (C:/dev/typescript/src/compiler/scanner.ts:311:38)             │ 28.3 ms   0.18% │ 28.3 ms   0.18% │
│ isRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11642:33)                 │ 27.2 ms   0.17% │ 38.1 ms   0.24% │
│ checkTypeRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11507:36)          │ 25.0 ms   0.16% │ 38.1 ms   0.24% │
│ getLateBoundSymbol (C:/dev/typescript/src/compiler/checker.ts:6513:36)           │ 22.8 ms   0.14% │ 22.8 ms   0.14% │
│ updateLineCountAndPosFor (C:/dev/typescript/src/compiler/utilities.ts:3150:42)   │ 22.8 ms   0.14% │ 25.0 ms   0.16% │
│ (anonymous function) (<inlined>)                                                 │ 18.5 ms   0.12% │ 18.5 ms   0.12% │

... (omitted for brevity) ...

│ getDeclarationName (C:/dev/typescript/src/compiler/binder.ts:253:36)             │  9.8 ms   0.06% │  9.8 ms   0.06% │
│ checkTypeRelatedTo (C:/dev/typescript/src/compiler/checker.ts:11507:36)          │  9.8 ms   0.06% │ 23.9 ms   0.15% │
└──────────────────────────────────────────────────────────────────────────────────┴─────────────────┴─────────────────┘
Only showing 50 of 117425 values returned.
```

All features of the LINQ syntax are available, however note that rather than `in`, this syntax uses the `of` keyword (due to
the fact JavaScript has a conflicting expression-level `in` operator):

- `from` clause: `from x of y`
- `join` clause: `join a of b on x.id equals a.id`
- `join-into` clause: `join a of b on x.id equals a.id into g`
- `let` clause: `let x = 1`
- `where` clause: `where x.hitCount > 10`
- `orderby` clause: `orderby x.selfTime descending, x.functionName`
- `group` clause: `group x by x.url`
- `group-into` clause: `group x by x.url into files`
- `select` clause: `select x` or `select { a, x }` (etc.)
- `select-into` clause: `select { a, x } into z`

You can read more about this syntax here:

- Implementation: https://github.com/rbuckton/iterable-query-linq#readme
- Strawman: https://gist.github.com/rbuckton/19b771342f7e2840c1c59d5041552ee1
