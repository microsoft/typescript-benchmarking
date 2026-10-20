#!/usr/bin/env bash

set -eo pipefail

ARGS=(
    --clearenv
    --setenv HOME "${HOME:?Expected HOME}"
    --setenv PATH "${PATH:?Expected PATH}"
    --setenv CI true
    --setenv TSPERF_EXE "${TSPERF_EXE:?Expected TSPERF_EXE}"
    --setenv TSPERF_SCENARIO_CONFIG_DIR "${TSPERF_SCENARIO_CONFIG_DIR:?Expected TSPERF_SCENARIO_CONFIG_DIR}"
    --setenv TSPERF_SUITE_DIR "${TSPERF_SUITE_DIR:?Expected TSPERF_SUITE_DIR}"
    --setenv TSPERF_JOB_HOST "${TSPERF_JOB_HOST:?Expected TSPERF_JOB_HOST}"
    --setenv TSPERF_JOB_SCENARIO "${TSPERF_JOB_SCENARIO:?Expected TSPERF_JOB_SCENARIO}"
    --setenv TSPERF_JOB_ITERATIONS "${TSPERF_JOB_ITERATIONS:?Expected TSPERF_JOB_ITERATIONS}"
    --setenv TSPERF_JOB_WARMUPS "${TSPERF_JOB_WARMUPS:?Expected TSPERF_JOB_WARMUPS}"
    --setenv TSPERF_PREDICTABLE "${TSPERF_PREDICTABLE:?Expected TSPERF_PREDICTABLE}"
    --setenv TSPERF_API_MEMORY "${TSPERF_API_MEMORY:-false}"
    --setenv TSPERF_AGENT_BENCHMARK_CPUS "${TSPERF_AGENT_BENCHMARK_CPUS:?Expected TSPERF_AGENT_BENCHMARK_CPUS}"
)
if [ -v LANG ]; then
    ARGS+=(--setenv LANG "$LANG")
fi
if [ -v LC_ALL ]; then
    ARGS+=(--setenv LC_ALL "$LC_ALL")
fi
if [ -v LC_CTYPE ]; then
    ARGS+=(--setenv LC_CTYPE "$LC_CTYPE")
fi
if [ -v TZ ]; then
    ARGS+=(--setenv TZ "$TZ")
fi

exec bwrap "${ARGS[@]}" "$@"
