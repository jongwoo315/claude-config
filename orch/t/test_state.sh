#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
. "$ORCH_ROOT/lib/state.sh"

$ORCH_TMUX new-session -d -s claude-orch-demo

st_set claude-orch-demo @claude_state working
assert_eq "$(st_get claude-orch-demo @claude_state)" "working" "set/get roundtrip"

assert_eq "$(st_get claude-orch-demo @nope)" "" "missing option -> empty"

st_set claude-orch-demo @orch_task task-x
assert_contains "$(st_list_orch_sessions)" "claude-orch-demo" "lists orch sessions"

$ORCH_TMUX new-session -d -s unrelated
assert_eq "$(st_list_orch_sessions | grep -c unrelated)" "0" "ignores non-orch sessions"

finish
