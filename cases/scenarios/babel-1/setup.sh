#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/babel/babel.git 08b0472069cd207f043dd40a4d157addfdd36011

run_sandboxed sh -c 'yarn install'
