#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_strada_scenario

run_sandboxed sh -c '
    npm ci
    if test -f Herebyfile.mjs; then
        npx hereby generate-diagnostics
    else
        npx gulp generate-diagnostics
    fi
'
