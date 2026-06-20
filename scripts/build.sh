#!/usr/bin/env bash
#
# build.sh — produce distributable Bigphant builds.
#
#   macOS  : Apple Silicon (darwin/arm64) .app
#   Windows: x64 (windows/amd64) .exe
#
# Usage:
#   scripts/build.sh            # build both targets
#   scripts/build.sh mac        # build macOS arm64 only
#   scripts/build.sh windows    # build Windows amd64 only
#
# Notes:
#   - Run from the repo root (or anywhere; the script cd's to the repo root).
#   - Cross-compiling to Windows works from macOS because Wails uses a
#     pure-Go WebView2 binding on Windows (no CGO toolchain needed).
#   - Outputs land in build/bin/.
#
set -euo pipefail

# Resolve repo root (parent of this script's dir) and cd there.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

TARGET="${1:-all}"

if ! command -v wails >/dev/null 2>&1; then
  echo "error: wails CLI not found. Install with:" >&2
  echo "  go install github.com/wailsapp/wails/v2/cmd/wails@latest" >&2
  exit 1
fi

# Wipe previous artifacts once. (We can't use `wails build -clean` per-target:
# it empties build/bin, so the 2nd build would erase the 1st target's output.)
rm -rf build/bin
mkdir -p build/bin

build_mac() {
  echo "==> Building macOS (darwin/arm64)…"
  wails build -platform darwin/arm64
  echo "    -> build/bin/bigphant.app"
}

build_windows() {
  echo "==> Building Windows (windows/amd64)…"
  # -nsis would produce an installer but requires makensis (not bundled);
  # the plain .exe is the portable artifact.
  wails build -platform windows/amd64
  echo "    -> build/bin/bigphant.exe"
}

case "$TARGET" in
  mac|macos|darwin)   build_mac ;;
  win|windows)        build_windows ;;
  all)                build_mac; build_windows ;;
  *)
    echo "error: unknown target '$TARGET' (expected: mac | windows | all)" >&2
    exit 1
    ;;
esac

echo
echo "Done. Artifacts in build/bin/:"
ls -1 build/bin 2>/dev/null || true
