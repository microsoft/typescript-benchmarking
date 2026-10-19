#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/getsentry/sentry.git b9986f581289d41fdad9b42f9ec8b6c828aa4da6

run_sandboxed sh -c '
    npx --yes pnpm@12.10.1 install --frozen-lockfile --ignore-scripts &&
    npx --yes --package=typescript@7.0.2 tsc -b static/packages/icons static/packages/scraps/tsconfig.test.json
'
