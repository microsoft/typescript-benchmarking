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
        echo "Using user docker socket with runsc-rootless"
        export DOCKER_HOST=unix://$USER_DOCKER_SOCK
        DOCKER_RUNTIME=runsc-rootless
        DOCKER_IS_ROOTLESS=1
    else
        echo "Using default docker socket with runsc"
        export DOCKER_HOST=unix:///var/run/docker.sock
        DOCKER_RUNTIME=runsc
    fi

    # This image is mirrored and will not be rate limited.
    NODE_IMAGE=mcr.microsoft.com/mirror/docker/library/node:20

    INTERNET=ts-perf-sandbox-internet
    NO_INTERNET=ts-perf-sandbox-internal

    SANDBOX_CONTAINER=ts-perf-sandbox
    PROXY_CONTAINER=ts-perf-sandbox-proxy
    PROXY_IMAGE=$PROXY_CONTAINER

    function cleanup {
        echo "Cleaning up..."
        docker rm --force --volumes $PROXY_CONTAINER || true
        docker rm --force --volumes $SANDBOX_CONTAINER || true
        docker network rm --force $INTERNET || true
        docker network rm --force $NO_INTERNET || true
        docker system prune --force --volumes || true
    }

    trap cleanup EXIT
    trap cleanup INT  

    cleanup

    # Pull an extra time to ensure the image is up-to-date.
    # The final cleanup will be able to remove unused images left behind.
    docker pull $NODE_IMAGE

    (cd ../../sandbox; docker build -t $PROXY_IMAGE -f proxy.Dockerfile --build-arg="BASE_IMAGE=$NODE_IMAGE" .)

    echo "Creating networks"
    docker network create --driver bridge $INTERNET
    docker network create --driver bridge --internal $NO_INTERNET

    PROXY_PORT=8888

    echo "Creating proxy server"
    docker run \
        --rm \
        --detach \
        --name=$PROXY_CONTAINER \
        --network=$INTERNET \
        $PROXY_IMAGE

    # Log the proxy's output to the console.
    docker attach $PROXY_CONTAINER &

    # Docker doesn't let you attach multiple networks up-front.
    docker network connect $NO_INTERNET $PROXY_CONTAINER

    PROXY_HOST=$(docker inspect --format "{{(index .NetworkSettings.Networks \"$NO_INTERNET\").IPAddress}}" $PROXY_CONTAINER)
    PROXY_ADDR="http://$PROXY_HOST:$PROXY_PORT"

    # If using rootless docker, the contianer's root user will be mapped to the host's user,
    # so we can just use it as-is. But if we're not using rootless docker, we need to instead
    # use a non-root user, and it's easiest to just modify the container's existing non-root user.
    if [[ -z "$DOCKER_IS_ROOTLESS" ]]; then
        CHANGE_USER_ID=$(id -u)
    fi

    echo "Running sandbox"
    docker run \
        --runtime=$DOCKER_RUNTIME \
        --name $SANDBOX_CONTAINER \
        --rm \
        --network $NO_INTERNET \
        --volume $PWD:/sandbox \
        --workdir /sandbox \
        --env HTTP_PROXY=$PROXY_ADDR \
        --env HTTPS_PROXY=$PROXY_ADDR \
        --env YARN_HTTP_PROXY=$PROXY_ADDR \
        --env YARN_HTTPS_PROXY=$PROXY_ADDR \
        --env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
        --env CHANGE_USER_ID=$CHANGE_USER_ID \
        $NODE_IMAGE \
        sh -c '
            set -ex &&
            echo Verifying network &&
            (curl -sL -o /dev/null https://registry.npmjs.org && echo "could reach registry (expected)" || (echo "could not reach registry (unexpected)"; exit 1)) &&
            (! curl -sL -o /dev/null https://github.com && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
            (! curl -sL -o /dev/null https://1.1.1.1 && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
            if [ -n "$CHANGE_USER_ID" ]; then
                groupmod -g $CHANGE_USER_ID node && usermod -u $CHANGE_USER_ID -g $CHANGE_USER_ID node
                exec su node "$@"
            else
                exec "$@"
            fi
        ' -- "$@"
}
