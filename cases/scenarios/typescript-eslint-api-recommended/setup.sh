#!/usr/bin/env bash
set -exo pipefail
cd "${0%/*}"

source ../../common.sh
source ../../api/eslint-setup.sh recommended
