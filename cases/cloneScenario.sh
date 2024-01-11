#!/usr/bin/env bash

# https://stackoverflow.com/a/28776166
(return 0 2>/dev/null) || (echo "This script should be sourced, not executed."; exit 1)

set -exo pipefail

# We're assuming that $PWD is the directory containing scenario.json.

SCENARIO_REPO=$1
SCENARIO_NAME=${SCENARIO_NAME:-$(basename $PWD)}
SOLUTION_DIR=${SOLUTION_DIR:-../../solutions/$SCENARIO_NAME}

if ! test -d $SOLUTION_DIR; then
  git clone --filter blob:none $SCENARIO_REPO $SOLUTION_DIR
fi

cd $SOLUTION_DIR
git clean -fdx
git reset --hard HEAD

if test -z "$SCENARIO_REF"; then
  SCENARIO_REF=$(git rev-parse HEAD)
  echo "##vso[task.setvariable variable=SCENARIO_REF]$SCENARIO_REF"
else
  git fetch origin $SCENARIO_REF
  git switch --detach FETCH_HEAD
fi
