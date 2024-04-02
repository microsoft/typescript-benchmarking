#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/webpack/webpack.git 228fc69f40c3e9ec6d99a5105fdc85b5bca4ce43

run_sandboxed sh -c '
    COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts

    # https://github.com/webpack/webpack/blob/228fc69f40c3e9ec6d99a5105fdc85b5bca4ce43/.github/workflows/test.yml#L135
    LINK_FOLDER=$PWD/node_modules/.yarn-link
    COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 link --link-folder $LINK_FOLDER
    COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 link --link-folder $LINK_FOLDER webpack
'
