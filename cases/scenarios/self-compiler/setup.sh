#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME
rm -rf $SOLUTION_DIR

git clone --filter blob:none https://github.com/microsoft/vscode.git $SOLUTION_DIR
cd $SOLUTION_DIR
git fetch origin ${TYPESCRIPT_COMMIT}
git switch --detach ${FETCH_HEAD}
npm ci
npx hereby generate-diagnostics
