#!/usr/bin/env bash
# compress installer shim. All logic lives in bin/install.js.
set -euo pipefail

SELF="${BASH_SOURCE[0]:-}"
if [ -n "$SELF" ] && [ -f "$SELF" ]; then
  DIR="$(cd "$(dirname "$SELF")" && pwd)"
  if [ -f "$DIR/bin/install.js" ]; then
    exec node "$DIR/bin/install.js" "$@"
  fi
fi

REPO="${COMPRESS_REPO:-ghostlives/compress-skill}"
exec npx -y "github:$REPO" -- "$@"
