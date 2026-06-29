#!/usr/bin/env bash
#
# Build the Bigphant Linux .deb inside Docker (OrbStack works transparently).
#
#   ./build/linux/build-deb.sh [VERSION]
#
# VERSION defaults to 0.5.0. The resulting package is written to ./dist/.
#
# OrbStack on Apple Silicon defaults to arm64 containers; we force
# linux/amd64 so the .deb targets typical x86 Ubuntu desktops. Drop the
# --platform flags below if you intend to ship an arm64 package.
set -euo pipefail

VERSION="${1:-0.5.0}"
PLATFORM="linux/amd64"
IMAGE="bigphant-deb-builder"

# Run from the repo root regardless of where the script is invoked.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

mkdir -p dist

echo ">> Building builder image ($PLATFORM)..."
docker build --platform "$PLATFORM" \
  -f build/linux/Dockerfile \
  -t "$IMAGE" .

echo ">> Packaging .deb (version $VERSION) into ./dist ..."
docker run --rm --platform "$PLATFORM" \
  -e VERSION="$VERSION" \
  -v "$ROOT/dist:/out" \
  "$IMAGE" \
  nfpm package -f build/linux/nfpm.yaml -p deb \
    -t "/out/bigphant_${VERSION}_amd64.deb"

echo ">> Done: dist/bigphant_${VERSION}_amd64.deb"
