#!/usr/bin/env bash

# https://stackoverflow.com/a/28776166
(return 0 2>/dev/null) || (echo "This script should be sourced, not executed."; exit 1)

function clone_scenario() {
    SCENARIO_REPO=$1
    SCENARIO_REF=$2

    SCENARIO_NAME=$(basename $PWD)
    SOLUTION_DIR=../../solutions/$SCENARIO_NAME

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
}

function run_sandboxed() {
    USER_DOCKER_SOCK=/run/user/$(id -u)/docker.sock

    if [ -e $USER_DOCKER_SOCK ]; then
        echo "Using user docker socket"
        export DOCKER_HOST=unix://$USER_DOCKER_SOCK
        DOCKER_RUNTIME=runsc-rootless
    else
        echo "Using default docker socket and runtime; this is not secure!"
        export DOCKER_HOST=unix:///var/run/docker.sock
        # No runsc here; global daemon would need to have passed "--network host" which is not the default.
        DOCKER_RUNTIME=""
    fi

    INTERNET=sandbox-internet
    NO_INTERNET=sandbox-internal

    VERDACCIO_CONTAINER=sandbox-verdaccio
    SANDBOX_CONTAINER=sandbox

    function cleanup {
        echo "Cleaning up..."
        docker rm --force --volumes $VERDACCIO_CONTAINER || true
        docker rm --force --volumes $SANDBOX_CONTAINER || true
        docker network rm --force $INTERNET || true
        docker network rm --force $NO_INTERNET || true
        docker system prune --force --volumes
    }

    trap cleanup EXIT
    trap cleanup INT  

    cleanup

    echo "Creating networks"
    docker network create --driver bridge $INTERNET
    docker network create --driver bridge --internal $NO_INTERNET

    # docker network ls --format '{{. | json}}' | jq

    echo "Creating verdaccio server"
    docker run \
        --runtime=$DOCKER_RUNTIME \
        --rm \
        --detach \
        --name=$VERDACCIO_CONTAINER \
        --network=$INTERNET \
        --publish=127.0.0.1::4873 \
        docker.io/verdaccio/verdaccio

    docker network connect $NO_INTERNET $VERDACCIO_CONTAINER

    REGISTRY_PORT=4873
    VERDACCIO_HOST_ADDR=$(docker port $VERDACCIO_CONTAINER $REGISTRY_PORT)

    # wait for server to start
    n=0
    until [ "$n" -ge 5 ]
    do
        curl -sL -o /dev/null $VERDACCIO_HOST_ADDR && break
        n=$((n+1)) 
        sleep 1
    done

    if [ "$n" -ge 5 ]; then
        echo "Failed to start verdaccio"
        exit 1
    fi

    REGISTRY_HOST=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$NO_INTERNET\").IPAddress}}" $VERDACCIO_CONTAINER)
    REGISTRY_ADDR="http://$REGISTRY_HOST:$REGISTRY_PORT"

    if [[ -z "$DOCKER_RUNTIME" ]]; then
        CHANGE_USER_ID=$(id -u)
    fi

    echo "Verdaccio is running at $REGISTRY_ADDR"

    echo "Running sandbox"
    docker run \
        --runtime=$DOCKER_RUNTIME \
        --name $SANDBOX_CONTAINER \
        --rm \
        --network $NO_INTERNET \
        --volume $PWD:/sandbox \
        --workdir /sandbox \
        --env REGISTRY_HOST=$REGISTRY_HOST \
        --env REGISTRY_ADDR=$REGISTRY_ADDR \
        --env COREPACK_NPM_REGISTRY=$REGISTRY_ADDR \
        --env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        --env npm_config_registry=$REGISTRY_ADDR \
        --env CHANGE_USER_ID=$CHANGE_USER_ID \
        docker.io/library/node:20 \
        sh -c '
            set -ex &&
            echo Verifying network &&
            (curl -L -o /dev/null --retry 5 --retry-connrefused $REGISTRY_ADDR && echo "reached verdaccio (expected)" || (echo "could not reach verdaccio (unexpected)"; exit 1)) &&
            (! curl -L -o /dev/null https://registry.npmjs.org && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
            (! curl -L -o /dev/null https://1.1.1.1 && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
            if [ -n "$CHANGE_USER_ID" ]; then
                groupmod -g $CHANGE_USER_ID node && usermod -u $CHANGE_USER_ID -g $CHANGE_USER_ID node
                exec su node "$@"
            else
                exec "$@"
            fi
        ' -- "$@"
}
