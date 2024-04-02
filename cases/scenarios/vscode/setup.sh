#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/microsoft/vscode.git

run_sandboxed sh -c '
    COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
'
