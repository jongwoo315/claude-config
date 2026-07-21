#!/usr/bin/env bash
# Stuck-detection keys off orch's own @orch_seen_at clock, not the hook-owned
# @claude_state_at — so a daemon restart (which clears @orch_seen_at) gives a
# mid-flight session a fresh grace period instead of failing it on tick 1.
. "$(dirname "$0")/lib.sh"
export ORCH_CLAUDE_CMD="cat"; export ORCH_MAX=9; export ORCH_IDLE_DEBOUNCE=0
export ORCH_STUCK_SECS=100
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"; . "$ORCH_ROOT/daemon.sh"

FAKE_NOW=1000
orch_now() { echo "$FAKE_NOW"; }

id=$(task_create /tmp/st single "x"); orch_tick   # dispatch -> running
sess=$(task_get "$id" session)

# First working observation stamps the clock; must not fail yet.
st_set "$sess" @claude_state working
st_unset "$sess" @orch_seen_at
orch_watch_failures
assert_eq "$(st_get "$sess" @orch_seen_at)" "1000" "seen_at stamped on first working"
assert_eq "$(task_get "$id" status)" "running" "not failed on first working"

# Still working STUCK_SECS later -> failed.
FAKE_NOW=1100
orch_watch_failures
assert_eq "$(task_get "$id" status)" "failed" "failed after stuck timeout"

# Clock resets when the session leaves working (idle/waiting).
id3=$(task_create /tmp/st3 single "z"); orch_tick
sess3=$(task_get "$id3" session)
st_set "$sess3" @claude_state working; orch_watch_failures   # stamps seen_at
st_set "$sess3" @claude_state idle;    orch_watch_failures   # leaves working
assert_eq "$(st_get "$sess3" @orch_seen_at)" "" "seen_at cleared when not working"

# Restart grace: a stale pre-restart seen_at would trip the timeout immediately;
# orch_reset_watch clears it so the next observation re-stamps a fresh clock.
id2=$(task_create /tmp/st2 single "y"); orch_tick
sess2=$(task_get "$id2" session)
st_set "$sess2" @claude_state working
st_set "$sess2" @orch_seen_at 500          # as if it survived a restart (500 << now)
orch_reset_watch
assert_eq "$(st_get "$sess2" @orch_seen_at)" "" "reset clears stale seen_at"
orch_watch_failures
assert_eq "$(task_get "$id2" status)" "running" "restart grace: not failed on stale state"
assert_eq "$(st_get "$sess2" @orch_seen_at)" "1100" "restart re-stamps fresh clock"

finish
