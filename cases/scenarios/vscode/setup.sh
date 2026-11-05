#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/microsoft/vscode.git

run_sandboxed sh -c 'npx --yes pnpm@12.16.0 install --frozen-lockfile --ignore-scripts'

# VS Code downloads Electron's types in a postinstall script, which --ignore-scripts
# skips. Fetch them here instead, verified against VS Code's checksum manifest.
ELECTRON_VERSION=$(jq -er '.nativeBuild.target | strings | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' package.json)
ELECTRON_TYPES_SHA256=$(sed -nE 's/^([a-f0-9]{64}) \*electron\.d\.ts$/\1/p' build/checksums/electron.txt)
test -n "$ELECTRON_VERSION"
test -n "$ELECTRON_TYPES_SHA256"
mkdir -p .build/typings
curl -fsSL --retry 3 -o .build/typings/electron.d.ts "https://github.com/electron/electron/releases/download/v$ELECTRON_VERSION/electron.d.ts"
echo "$ELECTRON_TYPES_SHA256  .build/typings/electron.d.ts" | sha256sum -c -
