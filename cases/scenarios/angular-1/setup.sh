#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/angular/angular.git 9894278e712a50079af87898a63e1d19a462d015

run_sandboxed sh -c '
    export PUPPETEER_SKIP_DOWNLOAD=true &&
    npx json5 tsconfig-tslint.json > tsconfig-tslint.json.new &&
    mv tsconfig-tslint.json.new tsconfig-tslint.json &&
    npx json -I -f tsconfig-tslint.json -e "this.exclude = [\"**/test_cases/**\"]" &&
    yarn install
'
