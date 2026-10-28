#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/typestack/class-transformer.git a2734a5d154c9b0beb9a10555a04416bc371de06

cp ../../scenarios/class-transformer/tsconfig.benchmark.json .

run_sandboxed sh -c 'npm ci --ignore-scripts --no-audit --no-fund'
