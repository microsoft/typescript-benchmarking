#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

export SCENARIO_REF=$TYPESCRIPT_COMMIT
source ../../cloneScenario.sh https://github.com/microsoft/TypeScript.git

npm ci
npx hereby generate-diagnostics
