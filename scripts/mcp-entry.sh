#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/st6ka8/Code/logseq-doc-agent"
LOG_DIR="$ROOT/.logseq/mcp"
LOG_FILE="$LOG_DIR/harness-entry.log"
mkdir -p "$LOG_DIR"

{
  echo "==== $(date -Is) mcp-entry start ===="
  echo "PWD=$PWD"
  echo "SCRIPT=$0"
  echo "ARGS=$*"
  echo "NODE_OPTIONS=${NODE_OPTIONS-<unset>}"
} >> "$LOG_FILE"

cd "$ROOT"
exec env -u NODE_OPTIONS npm run start:mcp:legacy
