#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/babel/babel.git eccbd203383487f6957dcf086aa83d773691560b

run_sandboxed sh -c 'yarn install'
