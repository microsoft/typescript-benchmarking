#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/angular/angular.git cc57d4c4998b4e38f940afdf358af37185028072

run_sandboxed sh -c 'yarn install --ignore-scripts --ignore-engines'
