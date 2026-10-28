#!/usr/bin/env bash
# Installs a pinned gVisor release into /usr/local/bin for the scenario installer sandbox.
# Upstream's "latest" tarball, checksum, and apt index are replaced separately, so they can
# disagree while a release is being published. Pin a release and commit its checksums.
# To update, pick a release from https://gvisor.dev/docs/user_guide/install/ and use the
# checksums from its gvisor.tar.bz2.sha512 files.

set -eo pipefail

GVISOR_RELEASE=20261019.0
ARCH=$(uname -m)
case "$ARCH" in
    x86_64) GVISOR_SHA512=7cbc2aeeee809dcccfb40e612504a1b76f2c119790cee59e482f7b35428cccc4f71705e7e322442d07d1f7d29b5d9e72e31319fc3088d6dcbec9fc7c1f0d8881 ;;
    aarch64) GVISOR_SHA512=6b14b582cd3185169df54275eed8721d94c9b40e6cb1533d0d0c46573271c6d2d03db586ea1caac46a45e805797f00b115bead9fb93636a1ffa69f2430958977 ;;
    *)
        echo "Unsupported architecture for gVisor" >&2
        exit 1
        ;;
esac

INSTALL_DIR=$(mktemp -d "${RUNNER_TEMP:-${AGENT_TEMPDIRECTORY:-/tmp}}/tsperf-runsc.XXXXXX")
trap 'rm -f "$INSTALL_DIR/gvisor.tar.bz2"; rmdir "$INSTALL_DIR"' EXIT

curl -fsSL --retry 3 "https://storage.googleapis.com/gvisor/releases/release/$GVISOR_RELEASE/$ARCH/gvisor.tar.bz2" \
    -o "$INSTALL_DIR/gvisor.tar.bz2"
echo "$GVISOR_SHA512  $INSTALL_DIR/gvisor.tar.bz2" | sha512sum --check
sudo tar -xjf "$INSTALL_DIR/gvisor.tar.bz2" -C /usr/local/bin --no-same-owner --no-same-permissions
