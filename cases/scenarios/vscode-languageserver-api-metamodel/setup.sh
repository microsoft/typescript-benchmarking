#!/usr/bin/env bash
set -exo pipefail
cd "${0%/*}"

source ../../common.sh
clone_scenario https://github.com/andrewbranch/vscode-languageserver-node.git fe89061e918472537a1d54132b17fe3cadd85741
git show HEAD:protocol/metaModel.json > expected.json
run_sandboxed sh -c '
    set -ex
    npm ci --ignore-scripts --no-audit --no-fund
    node node_modules/typescript/bin/tsc -b tools/tsconfig.json types/tsconfig.json jsonrpc/tsconfig.json protocol/src/common/tsconfig.json
'
