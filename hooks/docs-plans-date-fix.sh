#!/bin/bash
# PostToolUse:Write hook — auto-fix docs/plans date format
# Renames YYYY-MM-DD- prefix to YYMMDD- in docs/plans/ files

trap 'exit 0' ERR
set -uo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Only act on docs/plans/ files with YYYY-MM-DD- prefix
# Pattern: .../docs/plans/2026-03-20-topic-design.md
if echo "$FILE_PATH" | grep -qE '/docs/plans/20[0-9]{2}-[0-9]{2}-[0-9]{2}-'; then
  DIR=$(dirname "$FILE_PATH")
  BASENAME=$(basename "$FILE_PATH")

  # Extract YYYY-MM-DD and convert to YYMMDD
  # 2026-03-20-topic-design.md → 260320-topic-design.md
  NEW_BASENAME=$(echo "$BASENAME" | sed -E 's/^20([0-9]{2})-([0-9]{2})-([0-9]{2})-/\1\2\3-/')
  NEW_PATH="$DIR/$NEW_BASENAME"

  if [ "$FILE_PATH" != "$NEW_PATH" ] && [ -f "$FILE_PATH" ]; then
    mv "$FILE_PATH" "$NEW_PATH"
  fi
fi

exit 0
