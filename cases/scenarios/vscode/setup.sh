#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/microsoft/vscode.git

run_sandboxed sh -c 'npm ci --ignore-scripts'
