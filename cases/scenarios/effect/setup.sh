#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/Effect-TS/effect.git 7ea1ea2ecfb1bb4808901c522259de44aaee6136

# Do not let Effect's prepare script patch its installed compiler.
run_sandboxed sh -c 'npx --yes pnpm@11.20.0 install --frozen-lockfile --ignore-scripts'
