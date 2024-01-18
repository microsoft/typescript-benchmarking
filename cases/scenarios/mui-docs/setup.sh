#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../cloneScenario.sh https://github.com/mui/material-ui.git

pnpm install --ignore-scripts
