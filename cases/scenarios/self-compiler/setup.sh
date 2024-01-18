#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=$TYPESCRIPT_COMMIT
source ../../cloneScenario.sh https://github.com/microsoft/TypeScript.git

npm ci
if test -f Herebyfile.mjs; then
  npx hereby generate-diagnostics
else
  npx gulp generate-diagnostics
fi
