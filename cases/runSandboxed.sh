#!/usr/bin/env bash

set -eo pipefail
# set -x

export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock

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
    --runtime=runsc-rootless \
    --rm \
    --detach \
    --name=$VERDACCIO_CONTAINER \
    --network=$INTERNET \
    --publish=127.0.0.1::4873 \
    docker.io/verdaccio/verdaccio

docker network connect $NO_INTERNET $VERDACCIO_CONTAINER

VERDACCIO_HOST_ADDR=$(docker port $VERDACCIO_CONTAINER 4873)

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
REGISTRY_ADDR="http://$REGISTRY_HOST:4873"

echo "Verdaccio is running at $REGISTRY_ADDR"

echo "Running sandbox"
docker run \
    --runtime=$RUNSC_ROOTLESS \
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
        echo Verifying network setup &&
        (curl -L -o /dev/null --retry 5 --retry-connrefused $REGISTRY_ADDR && echo "reached verdaccio (expected)" || (echo "could not reach verdaccio (unexpected)"; exit 1)) &&
        (! curl -L -o /dev/null https://registry.npmjs.org && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
        (! curl -L -o /dev/null https://1.1.1.1 && echo "could not reach internet (expected)" || (echo "could reach internet (unexpected)"; exit 1)) &&
        exec "$@"
    ' -- "$@"
