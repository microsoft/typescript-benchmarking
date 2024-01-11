#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=f88bce8fe6a6d2ccd27cbd64bb26853cd8779afa
source ../../cloneScenario.sh https://github.com/microsoft/vscode.git

COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
