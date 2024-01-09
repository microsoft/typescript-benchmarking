#!/usr/bin/env bash

set -exo pipefail

cd "${0%/*}"
SCENARIO_NAME=$(basename $PWD)
SOLUTION_DIR=../../solutions/$SCENARIO_NAME

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none https://github.com/webpack/webpack.git $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD
git switch --detach 228fc69f40c3e9ec6d99a5105fdc85b5bca4ce43
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts

# https://github.com/webpack/webpack/blob/228fc69f40c3e9ec6d99a5105fdc85b5bca4ce43/.github/workflows/test.yml#L135
LINK_FOLDER=$PWD/node_modules/.yarn-link
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 link --link-folder $LINK_FOLDER
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 link --link-folder $LINK_FOLDER webpack
