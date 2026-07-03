#!/usr/bin/env bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
[ -z "$FILE_PATH" ] || [ ! -f "$FILE_PATH" ] && exit 0

# Allow reads with limit/offset — small partial reads are fine (e.g., to satisfy Edit's "read first" requirement)
LIMIT=$(echo "$INPUT" | jq -r '.tool_input.limit // ""')
OFFSET=$(echo "$INPUT" | jq -r '.tool_input.offset // ""')
[ -n "$LIMIT" ] || [ -n "$OFFSET" ] && exit 0

LINE_COUNT=$(wc -l < "$FILE_PATH" | tr -d ' ')
if [ "$LINE_COUNT" -gt 400 ]; then
    jq -n --arg fp "$FILE_PATH" --argjson lc "$LINE_COUNT" '{
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: "BLOCKED: File has \($lc) lines (>400). Do NOT use bash sed/cat/head as fallback.\n\nFlow:\n  1. ask-kimi --paths \"\($fp)\" --question \"<your question>\"\n  2. If you need to Edit: Read with limit=50 first (satisfies Edit requirement), then Edit with specific old_string/new_string\n\nFORBIDDEN: sed -i, cat, head as workaround for blocked Read"
        }
    }'
fi
exit 0
