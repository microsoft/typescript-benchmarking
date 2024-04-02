#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/mui/material-ui.git 48a29227cb737c6f008a62f9c8c4c47aedd99c43

run_sandboxed sh -c 'corepack enable; pnpm install --ignore-scripts'
