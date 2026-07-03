#!/bin/bash
# Stop hook — Session reflection for insight capture
# Counts Claude turns per session. After MIN_TURNS, outputs a reflection prompt ONCE.
# Trivial sessions (1-2 turns) are skipped — unlikely to have insight shifts.

trap 'exit 0' ERR
set -uo pipefail

MIN_TURNS=3

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

if [ -z "$SESSION_ID" ]; then
  exit 0
fi

# Skip ClaudeClaw bot sessions — Telegram/Discord output would interrupt live conversations
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
if [ -n "$CWD" ] && [ -d "$CWD/.claude/claudeclaw" ]; then
  exit 0
fi

# Already a re-run after reflection — let Claude finish
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Already reflected this session — exit silently to break the loop
FIRED="/tmp/claude-learning-hook-fired-${SESSION_ID}"
if [ -f "$FIRED" ]; then
  exit 0
fi

# Increment turn counter
COUNTER="/tmp/claude-learning-hook-counter-${SESSION_ID}"
COUNT=0
if [ -f "$COUNTER" ]; then
  COUNT=$(cat "$COUNTER")
fi
COUNT=$((COUNT + 1))
echo "$COUNT" > "$COUNTER"

# Not mature enough yet — skip
if [ "$COUNT" -lt "$MIN_TURNS" ]; then
  exit 0
fi

# Mark as fired (one-shot) and clean up counter
touch "$FIRED"
rm -f "$COUNTER"

# Ensure learnings directory exists
mkdir -p ~/.claude/learnings

# Detailed criteria stored in file to keep reason short
CRITERIA_FILE="$HOME/.claude/hooks/learning-hook-criteria.md"
REASON="세션 회고. Read $CRITERIA_FILE for criteria, then follow it."
echo "{\"decision\":\"block\",\"reason\":$(echo "$REASON" | jq -Rs .)}"
