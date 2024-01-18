#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../cloneScenario.sh https://github.com/microsoft/vscode.git

COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
