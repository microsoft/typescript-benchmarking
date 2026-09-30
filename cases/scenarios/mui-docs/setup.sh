#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

# Pin the last MUI ref known to install in the sandbox. Newer refs segfaulted
# during pnpm install (https://dev.azure.com/typescript/TypeScript/_build/results?buildId=169099).
clone_scenario https://github.com/mui/material-ui.git 6780195595c12252a130aa5ae5c5bd461229c6b7

run_sandboxed sh -c 'npx $(node -e "console.log(JSON.parse(fs.readFileSync(\"package.json\", \"utf8\")).packageManager)") install --ignore-scripts'
