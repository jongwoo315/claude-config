#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
. "$ORCH_ROOT/lib/state.sh"
export ORCH_CLAUDE_CMD="cat"   # mock: harmless long-lived-ish command
. "$ORCH_ROOT/lib/spawn.sh"

sess=$(spawn_session task-demo-0 /tmp "first step" true)
# Name mirrors the task id verbatim — NOT the target dir basename. (Old rule built
# it from the dir slug plus ${id##*-}, which on a DEV-#### id appended the ticket
# number: claude-orch-pf-policy-bot-DEV-7133-7133.)
assert_eq "$sess" "claude-orch-task-demo-0" "session name mirrors task id"
assert_eq "$($ORCH_TMUX has-session -t "$sess" 2>/dev/null; echo $?)" "0" "session exists"
assert_eq "$(st_get "$sess" @orch_task)" "task-demo-0" "task id stamped"
assert_eq "$(st_get "$sess" @claude_title)" "task-demo-0" "picker label stamped"
assert_eq "$(st_get "$sess" @claude_state)" "" "state NOT self-seeded (hooks own it)"
assert_eq "$(st_get "$sess" @orch_await)" "working" "await=working after step sent"

finish
