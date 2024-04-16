#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/statelyai/xstate.git 9118720b2d81cd3cd6b8e4ea8da75d576c47fa8d

run_sandboxed sh -c 'yarn install'
