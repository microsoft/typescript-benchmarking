#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none https://github.com/statelyai/xstate.git $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD
git switch --detach 6113a590a6e16c22f3d3e288b825975032bdfd48
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
# Manually running only this script; don't run the scripts from deps
# just to make sure we don't run anything unexpected.
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 run postinstall
