#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

clone_scenario https://github.com/microsoft/TypeScript.git $TYPESCRIPT_COMMIT

npm ci
if test -f Herebyfile.mjs; then
  npx hereby generate-diagnostics
else
  npx gulp generate-diagnostics
fi
