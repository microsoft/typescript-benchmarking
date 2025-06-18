#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/microsoft/vscode.git f88bce8fe6a6d2ccd27cbd64bb26853cd8779afa

run_sandboxed sh -c 'yarn install --ignore-scripts --ignore-engines'
