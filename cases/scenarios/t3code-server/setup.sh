#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/pingdotgg/t3code.git a01c48f86245f2a779f9af84042f3b09fbdeb91f

run_sandboxed sh -c 'npx --yes pnpm@11.10.0 install --frozen-lockfile --ignore-scripts'
