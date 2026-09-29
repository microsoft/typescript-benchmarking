#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/mui/material-ui.git

# The Node 22 image can lag behind MUI's minimum supported Node version.
NODE_IMAGE=mcr.microsoft.com/devcontainers/javascript-node:24
run_sandboxed sh -c 'npx $(node -e "console.log(JSON.parse(fs.readFileSync(\"package.json\", \"utf8\")).packageManager)") install --ignore-scripts'
