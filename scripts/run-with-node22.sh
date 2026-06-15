#!/bin/sh
set -eu

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

if [ -n "${PILL_GAME_NODE_BIN:-}" ] && [ -x "${PILL_GAME_NODE_BIN}" ]; then
  NODE_BIN="${PILL_GAME_NODE_BIN}"
elif [ -x "$HOME/.nvm/versions/node/v22.22.3/bin/node" ]; then
  NODE_BIN="$HOME/.nvm/versions/node/v22.22.3/bin/node"
else
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -path '*/bin/node' | sort -V | tail -n 1)"
fi

if [ ! -x "${NODE_BIN:-}" ]; then
  echo "Node 22+ runtime not found. Set PILL_GAME_NODE_BIN to a Node 22 binary." >&2
  exit 1
fi

NODE_VERSION="$("$NODE_BIN" -p 'process.versions.node')"
NODE_MAJOR="${NODE_VERSION%%.*}"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Need Node 22+, found $NODE_VERSION at $NODE_BIN" >&2
  exit 1
fi

if [ -x "$(dirname "$NODE_BIN")/yarn" ]; then
  YARN_BIN="$(dirname "$NODE_BIN")/yarn"
elif [ -x "$(dirname "$NODE_BIN")/corepack" ]; then
  YARN_BIN="$(dirname "$NODE_BIN")/corepack"
  set -- yarn "$@"
elif [ -x "$(dirname "$NODE_BIN")/../lib/node_modules/corepack/shims/yarn" ]; then
  YARN_BIN="$(dirname "$NODE_BIN")/../lib/node_modules/corepack/shims/yarn"
else
  echo "Matching Yarn/Corepack binary not found for $NODE_BIN" >&2
  exit 1
fi

export PATH="$(dirname "$NODE_BIN"):$PATH"
exec "$YARN_BIN" "$@"
