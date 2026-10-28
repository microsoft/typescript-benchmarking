#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/TanStack/router.git da2adec76dbe6c0da6d6a0d5640f7b9388217f45

run_sandboxed sh -c '
    export CI=1 NX_DAEMON=false NX_NO_CLOUD=true
    npx --yes pnpm@11.21.0 install --frozen-lockfile &&
    npx --yes pnpm@11.21.0 nx run-many -p @tanstack/history -t build --skipRemoteCache
'
