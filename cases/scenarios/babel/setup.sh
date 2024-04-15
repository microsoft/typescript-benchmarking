#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/babel/babel.git

run_sandboxed sh -c 'yarn install'
