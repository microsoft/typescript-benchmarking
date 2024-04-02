#!/usr/bin/env bash

set -exo pipefail
cd "${0%/*}"

source ../../common.sh

clone_scenario https://github.com/babel/babel.git eccbd203383487f6957dcf086aa83d773691560b

COREPACK_ENABLE_STRICT=0 corepack yarn@1.22.21 install --ignore-scripts
