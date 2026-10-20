#!/usr/bin/env bash

set -eo pipefail

: "${TSPERF_VARIABLES_FILE:?Expected a scenario variables file}"

if [[ ! "${TYPESCRIPT_COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Unexpected compiler commit for scenario setup" >&2
    exit 1
fi

# This handoff stays outside the solution mounted into third-party installers.
SCENARIO_REF_FILE=$(mktemp)
trap 'rm -f "$SCENARIO_REF_FILE"' EXIT
export TSPERF_SCENARIO_REF_FILE=$SCENARIO_REF_FILE

SETUP=$TSPERF_SCENARIO_CONFIG_DIR/$TSPERF_JOB_SCENARIO/setup.sh
if test -f "$SETUP"; then
    echo "Running $SETUP"
    bash "$SETUP"
fi

# The pipeline-controlled setup script hands off a commit ID outside the installer mount.
# Validate its format before handing it to the separate variable publisher.
if test -s "$SCENARIO_REF_FILE"; then
    SCENARIO_REF=$(cat "$SCENARIO_REF_FILE")
    if [[ ! "$SCENARIO_REF" =~ ^[0-9a-f]{40}$ ]]; then
        echo "Unexpected scenario commit from setup" >&2
        exit 1
    fi
    printf '{"SCENARIO_REF":"%s"}\n' "$SCENARIO_REF" > "$TSPERF_VARIABLES_FILE"
else
    printf '{}\n' > "$TSPERF_VARIABLES_FILE"
fi
