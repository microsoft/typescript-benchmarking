#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/bluesky-social/social-app.git 0cda84abe43f1ce60c8da9927f8f46e4aeeed529

run_sandboxed sh -c '
    npx --yes --package=pnpm@11.28.5 -c "
        pnpm install --frozen-lockfile --ignore-scripts --no-runtime &&
        pnpm lexicons:generate &&
        pnpm intl:compile
    "
'
