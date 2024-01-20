#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=48a29227cb737c6f008a62f9c8c4c47aedd99c43
source ../../cloneScenario.sh https://github.com/mui/material-ui.git

pnpm install --ignore-scripts
