#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/angular/angular.git cc57d4c4998b4e38f940afdf358af37185028072

run_sandboxed sh -c 'yarn install --ignore-scripts --ignore-engines'

# TypeScript 7 removed baseUrl, downlevelIteration, and moduleResolution node;
# without this, config errors cause tsc to skip type checking entirely.
sed -i \
    -e '/Setting the "baseUrl" to a different directory/d' \
    -e '/packages like the native "http" module/d' \
    -e '/"baseUrl": "..",/d' \
    -e '/"downlevelIteration": true,/d' \
    -e 's/"moduleResolution": "node"/"moduleResolution": "bundler"/' \
    -e 's#"\./node_modules/#"../node_modules/#g' \
    -e 's#"\./packages/#"./#g' \
    packages/tsconfig.json
