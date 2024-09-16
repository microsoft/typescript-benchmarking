#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/statelyai/xstate.git

run_sandboxed sh -c 'PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npx $(node -e "console.log(JSON.parse(fs.readFileSync(\"package.json\", \"utf8\")).packageManager)") install'
