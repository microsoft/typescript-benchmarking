#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/microsoft/TypeScript.git d83a5e1281379da54221fe39d5c0cb6ef4d1c109

run_sandboxed sh -c '
    npm ci
    if test -f Herebyfile.mjs; then
        npx hereby generate-diagnostics
    else
        npx gulp generate-diagnostics
    fi
'

sed -i \
    -e 's/"compilerOptions": {/"compilerOptions": {\n        "strictFunctionTypes": false,/' \
    -e 's/"lib": \["es2015.iterable", "es2015.generator", "es5"\]/"lib": ["es2015"]/' \
    -e 's/"target": "es5"/"target": "es2015"/' \
    -e 's/"moduleResolution": "node"/"moduleResolution": "bundler"/' \
    src/tsconfig-base.json
sed -i 's#"outFile": "../../built/local/compiler.js"#"outDir": "dist"#' src/compiler/tsconfig.json
