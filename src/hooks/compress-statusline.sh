#!/usr/bin/env bash
# compress statusline badge.
# Reads the session JSON Claude Code pipes in on stdin, extracts session_id, and
# prints a colored badge for the active compress level. Prints nothing when off.
#
# Pure bash — no jq dependency. Bounded stdin read so it never blocks the badge.

set -u

CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SESSIONS_DIRNAME=".compress-sessions"
ACTIVE_FLAG="$CONFIG_DIR/.compress-active"

input=""
if [ ! -t 0 ]; then
  # -t 1 is an integer on purpose: macOS ships bash 3.2, which rejects -t 0.3.
  read -r -d '' -t 1 input || true
fi

session_id=""
if [ -n "$input" ]; then
  session_id=$(printf '%s' "$input" |
    sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9_-]\{1,128\}\)".*/\1/p' |
    head -n 1)
fi

mode=""
if [ -n "$session_id" ] && [ -f "$CONFIG_DIR/$SESSIONS_DIRNAME/$session_id.mode" ]; then
  mode=$(head -c 32 "$CONFIG_DIR/$SESSIONS_DIRNAME/$session_id.mode" 2>/dev/null | tr -d '[:space:]')
elif [ -f "$ACTIVE_FLAG" ]; then
  mode=$(head -c 32 "$ACTIVE_FLAG" 2>/dev/null | tr -d '[:space:]')
fi

# Never echo arbitrary bytes: whitelist the mode.
case "$mode" in
  lite | full | ultra) ;;
  *) exit 0 ;;
esac

orange='\033[38;5;208m'
reset='\033[0m'

if [ "$mode" = "full" ]; then
  printf "${orange}[COMPRESS]${reset}"
else
  upper=$(printf '%s' "$mode" | tr '[:lower:]' '[:upper:]')
  printf "${orange}[COMPRESS:%s]${reset}" "$upper"
fi

# Optional lifetime-savings suffix, written by external tooling. Opt out with
# COMPRESS_STATUSLINE_SAVINGS=0.
if [ "${COMPRESS_STATUSLINE_SAVINGS:-1}" != "0" ] && [ -f "$CONFIG_DIR/.compress-statusline-suffix" ]; then
  suffix=$(head -c 64 "$CONFIG_DIR/.compress-statusline-suffix" 2>/dev/null | tr -d '\n\r')
  case "$suffix" in
    *[!0-9.kK⛏\ ]*) ;;
    *) [ -n "$suffix" ] && printf ' %s' "$suffix" ;;
  esac
fi
