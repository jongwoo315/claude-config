#!/usr/bin/env bash
# A prompt submit_step could not submit must not leave the task `running` forever.
# The daemon keeps sending Enter, and fails the task after ORCH_UNSENT_SECS so that
# `orch wait` ends (166-kapt sat typed-but-unsent for 85 min, 2026-11-02).
. "$(dirname "$0")/lib.sh"
export ORCH_CLAUDE_CMD="cat"; export ORCH_MAX=9; export ORCH_IDLE_DEBOUNCE=0
export ORCH_STUCK_SECS=999999 ORCH_UNSENT_SECS=600 ORCH_SUBMIT_DELAY=0
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"; . "$ORCH_ROOT/daemon.sh"
FAKE_NOW=1000
orch_now() { echo "$FAKE_NOW"; }

# Never goes working -> submit_step reports UNSENT and stamps the clock.
id=$(task_create /tmp/un single "x"); orch_tick
sess=$(task_get "$id" session)
submit_step "$sess" "x" 2>/dev/null; rc=$?
assert_eq "$rc" "1" "submit_step returns nonzero on UNSENT"
assert_eq "$(st_get "$sess" @orch_unsent_at)" "1000" "unsent clock stamped"

FAKE_NOW=1300; orch_watch_failures
assert_eq "$(task_get "$id" status)" "running" "still retrying inside the window"

FAKE_NOW=1600; orch_watch_failures
assert_eq "$(task_get "$id" status)" "failed" "failed after ORCH_UNSENT_SECS"
out=$("$ORCH_ROOT/bin/orch" wait "$id"); rc=$?
assert_eq "$rc" "2" "orch wait ends with exit 2"
assert_contains "$out" "FAILED $id" "orch wait prints FAILED"

# A late Enter that lands clears the stamp and the task keeps running.
FAKE_NOW=2000
id2=$(task_create /tmp/un2 single "y"); orch_tick
sess2=$(task_get "$id2" session)
submit_step "$sess2" "y" 2>/dev/null
st_set "$sess2" @claude_state working
FAKE_NOW=2100; orch_watch_failures 2>/dev/null
assert_eq "$(st_get "$sess2" @orch_unsent_at)" "" "late submit clears unsent clock"
FAKE_NOW=2700; orch_watch_failures 2>/dev/null
assert_eq "$(task_get "$id2" status)" "running" "late submit is not failed"

finish
