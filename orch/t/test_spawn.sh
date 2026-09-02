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

# A session that outlived its task file makes spawn take the `-N` suffix path.
# The DISPLAY name must follow the suffix too — labelling both panes with the bare
# task id put two identically-named nodes on the picker and the web graph, so the
# newer session read as missing (2026-09-02, DEV-8600).
sess2=$(spawn_session task-demo-0 /tmp "second step" true)
assert_eq "$sess2" "claude-orch-task-demo-0-1" "collision takes -1 session name"
assert_eq "$(st_get "$sess2" @claude_title)" "task-demo-0-1" "label follows the suffix"
assert_eq "$(st_get "$sess2" @orch_task)" "task-demo-0" "task id stays the queue id"
assert_eq "$(st_get "$sess" @claude_title)" "task-demo-0" "first label untouched"

finish
