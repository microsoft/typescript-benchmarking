#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=40ec4fab867d150f71fcd15ce248cbc7f95fe87a
source ../../cloneScenario.sh https://github.com/statelyai/xstate.git

pnpm install --ignore-scripts
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
# Manually running only this script; don't run the scripts from deps
# just to make sure we don't run anything unexpected.
# TODO(jakebailey): this is probably unsafe, and we need to fix this before merging
COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 run postinstall
