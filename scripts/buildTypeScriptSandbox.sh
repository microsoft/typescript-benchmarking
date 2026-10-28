#!/usr/bin/env bash

set -eo pipefail

: "${AGENT_TOOLSDIRECTORY:?Expected the agent tool directory}"

SOURCE_DIR=$1
BUILD_HOME=$2
BUILD_TMP=$3
shift 3

if [ ! -d "$SOURCE_DIR/.git" ] || [ -L "$SOURCE_DIR/.git" ]; then
    echo "Unexpected Git metadata in compiler checkout" >&2
    exit 1
fi

# Builds need network access for public package/module downloads. Expose the compiler
# checkout and scratch directories, not the agent's home or benchmarking checkout.
# Clear inherited environment variables; files in the mounted trees remain readable.
ARGS=(
    --ro-bind /usr /usr --ro-bind /etc /etc --proc /proc --dev /dev
    --symlink usr/lib /lib --symlink usr/lib64 /lib64
    --symlink usr/bin /bin --symlink usr/sbin /sbin
    --ro-bind "$AGENT_TOOLSDIRECTORY" "$AGENT_TOOLSDIRECTORY"
    --bind "$SOURCE_DIR" "$SOURCE_DIR"
    --ro-bind "$SOURCE_DIR/.git" "$SOURCE_DIR/.git"
    # Bind /tmp first; the scratch home may live under the host's /tmp and must stay visible.
    --bind "$BUILD_TMP" /tmp --bind "$BUILD_HOME" "$BUILD_HOME"
    --clearenv --setenv HOME "$BUILD_HOME" --setenv PATH "$PATH"
    --setenv CI true --setenv COREPACK_ENABLE_DOWNLOAD_PROMPT 0
    --setenv COREPACK_ENABLE_STRICT 0 --setenv GIT_OPTIONAL_LOCKS 0
    --setenv HUSKY 0 --setenv HUSKY_SKIP_INSTALL 1
    --unshare-user --unshare-pid --unshare-ipc --unshare-uts
    --cap-drop ALL --die-with-parent --new-session --chdir "$SOURCE_DIR"
)
# Some images keep resolv.conf's target under /run, which is otherwise not exposed.
RESOLV_CONF=$(readlink -f /etc/resolv.conf)
ARGS+=(--ro-bind "$RESOLV_CONF" "$RESOLV_CONF")
if [ -n "${GOROOT:-}" ]; then
    ARGS+=(--setenv GOROOT "$GOROOT")
fi

exec bwrap "${ARGS[@]}" "$@"
