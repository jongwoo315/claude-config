#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
. "$ORCH_ROOT/lib/state.sh"
export ORCH_CLAUDE_CMD="cat"   # mock: harmless long-lived-ish command
. "$ORCH_ROOT/lib/spawn.sh"

sess=$(spawn_session task-demo-0 /tmp "first step" true)
assert_eq "$sess" "claude-orch-tmp-0" "session name from id"
assert_eq "$($ORCH_TMUX has-session -t "$sess" 2>/dev/null; echo $?)" "0" "session exists"
assert_eq "$(st_get "$sess" @orch_task)" "task-demo-0" "task id stamped"
assert_eq "$(st_get "$sess" @claude_state)" "working" "state seeded working"
assert_eq "$(st_get "$sess" @orch_await)" "working" "await=working after step sent"

finish
