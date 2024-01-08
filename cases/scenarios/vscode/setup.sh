#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solution/$SCENARIO_NAME

git clone --filter blob:none https://github.com/microsoft/vscode.git $SOLUTION_DIR
cd $SOLUTION_DIR
git switch --detach f88bce8fe6a6d2ccd27cbd64bb26853cd8779afa
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
