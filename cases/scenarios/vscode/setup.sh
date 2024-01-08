#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none https://github.com/microsoft/vscode.git $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD
git switch --detach f88bce8fe6a6d2ccd27cbd64bb26853cd8779afa
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
