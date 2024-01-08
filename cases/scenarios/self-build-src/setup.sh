#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none https://github.com/microsoft/TypeScript.git $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD
git fetch origin ${TYPESCRIPT_COMMIT}
git switch --detach ${FETCH_HEAD}
npm ci
npx hereby generate-diagnostics
