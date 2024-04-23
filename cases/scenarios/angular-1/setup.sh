#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/angular/angular.git 9894278e712a50079af87898a63e1d19a462d015

run_sandboxed sh -c 'yarn install'
