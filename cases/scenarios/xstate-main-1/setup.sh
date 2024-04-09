#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/statelyai/xstate.git 424ce971778236018f5a6447505909307880a687

run_sandboxed sh -c 'yarn install'
