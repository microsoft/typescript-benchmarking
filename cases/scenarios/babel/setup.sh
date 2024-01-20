#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=00853017dda14778bdb9bafd651d2e6b64449e2a
source ../../cloneScenario.sh https://github.com/babel/babel.git

COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts