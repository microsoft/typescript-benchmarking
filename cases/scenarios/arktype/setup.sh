#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/arktypeio/arktype.git c34bf69b3371f63ae383ac533e63ad9311452a8b

run_sandboxed sh -c 'npx --yes pnpm@10.19.0 install --frozen-lockfile --ignore-scripts'
