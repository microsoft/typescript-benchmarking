#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

if [ -n "$TSGOFLAG" ]; then
    clone_scenario https://github.com/microsoft/TypeScript.git
else
    clone_scenario https://github.com/microsoft/TypeScript.git $TYPESCRIPT_COMMIT
fi

run_sandboxed sh -c '
    npm ci
    if test -f Herebyfile.mjs; then
        npx hereby generate-diagnostics
    else
        npx gulp generate-diagnostics
    fi
'
