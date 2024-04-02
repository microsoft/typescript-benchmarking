#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/webpack/webpack.git

run_sandboxed sh -c '
    set -ex
    yarn config set registry $REGISTRY_ADDR
    sed -i "s|https://registry.yarnpkg.com|$REGISTRY_ADDR|g" yarn.lock
    yarn install --ignore-scripts

    # https://github.com/webpack/webpack/blob/228fc69f40c3e9ec6d99a5105fdc85b5bca4ce43/.github/workflows/test.yml#L135
    LINK_FOLDER=$PWD/node_modules/.yarn-link
    yarn link --link-folder $LINK_FOLDER
    yarn link --link-folder $LINK_FOLDER webpack
'
