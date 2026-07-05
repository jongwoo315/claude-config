#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
export ORCH_CLAUDE_CMD="cat"; export ORCH_MAX=1
export ORCH_IDLE_DEBOUNCE=5         # exercise the wall-clock debounce path
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"; . "$ORCH_ROOT/daemon.sh"

# Freeze "now" so the idle-age delta is deterministic (override AFTER sourcing).
FAKE_NOW=1000
orch_now() { echo "$FAKE_NOW"; }

id=$(task_create /tmp/p pipeline "s1" "s2")
orch_tick                           # dispatch -> running, cursor 0, await=working
sess=$(task_get "$id" session)

# Drive the working->idle edge so @orch_await flips to idle, then go idle.
st_set "$sess" @claude_state working; orch_tick   # await: working -> idle
st_set "$sess" @claude_state idle                 # now state=idle, await=idle

# Case A (too soon): idle age 2s < DEBOUNCE 5 -> must NOT advance
st_set "$sess" @claude_state_at $((FAKE_NOW - 2))
orch_tick
assert_eq "$(task_get "$id" cursor)" "0" "no advance when idle younger than debounce"

# Case B (old enough): idle age 10s >= DEBOUNCE 5 -> advance
st_set "$sess" @claude_state_at $((FAKE_NOW - 10))
orch_tick
assert_eq "$(task_get "$id" cursor)" "1" "advance when idle older than debounce"

finish
