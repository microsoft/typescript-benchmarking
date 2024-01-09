#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none https://github.com/mui/material-ui.git $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD
git switch --detach 48a29227cb737c6f008a62f9c8c4c47aedd99c43
pnpm install --ignore-scripts
