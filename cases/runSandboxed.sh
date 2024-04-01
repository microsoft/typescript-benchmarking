#!/usr/bin/env bash

set -eo pipefail
# set -x

USER_DOCKER_SOCK=/run/user/$(id -u)/docker.sock

if [ -e $USER_DOCKER_SOCK ]; then
    echo "Using user docker socket"
    export DOCKER_HOST=unix://$USER_DOCKER_SOCK
    DOCKER_RUNTIME=runsc-rootless
else
    echo "Using default docker socket and runtime; this is not secure!"
    export DOCKER_HOST=unix:///var/run/docker.sock
    # No runsc here; global daemon would need to have passed "--network host" which is not the default.
    # DOCKER_RUNTIME=runsc
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

echo "Verdaccio is running at $REGISTRY_ADDR"

echo "Running sandbox"
docker run \
    --runtime=$DOCKER_RUNTIME \
    --name $SANDBOX_CONTAINER \
    --rm \
    --interactive \
    --network $NO_INTERNET \
    --volume $PWD:/sandbox \
    --workdir /sandbox \
    --env REGISTRY_HOST=$REGISTRY_HOST \
    --env REGISTRY_ADDR=$REGISTRY_ADDR \
    --env COREPACK_NPM_REGISTRY=$REGISTRY_ADDR \
    docker.io/library/node:20 \
    sh -c '
        echo Verifying network &&
        (curl -L -o /dev/null --retry 5 --retry-connrefused $REGISTRY_ADDR && echo "reached verdaccio (expected)" || (echo "could not reach verdaccio (unexpected)"; exit 1)) &&
        (! curl -L -o /dev/null https://registry.npmjs.org && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
        (! curl -L -o /dev/null https://1.1.1.1 && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
        exec "$@"
    ' -- "$@"
