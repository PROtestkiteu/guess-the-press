#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
RUNNER="$SCRIPT_DIR/run-with-node22.sh"

cleanup() {
  if [ -n "${BUILD_PID:-}" ]; then
    kill "$BUILD_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

"$RUNNER" local:build &
BUILD_PID=$!

echo "Local preview building in watch mode..."
echo "Open http://127.0.0.1:3131 once the first build finishes."

"$RUNNER" local:serve
