#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=eccbd203383487f6957dcf086aa83d773691560b
source ../../cloneScenario.sh https://github.com/babel/babel.git

COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts