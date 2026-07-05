#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
export ORCH_CLAUDE_CMD="cat"; export ORCH_MAX=1
export ORCH_IDLE_DEBOUNCE=0        # no wall-clock wait in tests
. "$ORCH_ROOT/lib/task.sh"; . "$ORCH_ROOT/lib/state.sh"; . "$ORCH_ROOT/daemon.sh"

id=$(task_create /tmp/p pipeline "s1" "s2")
orch_tick                          # dispatch -> running, cursor 0, await=working
sess=$(task_get "$id" session)

# Trap A: fresh session forced idle should NOT advance while await=working
st_set "$sess" @claude_state idle
orch_tick
assert_eq "$(task_get "$id" cursor)" "0" "no advance before working seen"

# see working, then idle -> edge -> advance to step 2
st_set "$sess" @claude_state working; orch_tick
st_set "$sess" @claude_state idle;    st_set "$sess" @claude_state_at 1
orch_tick
assert_eq "$(task_get "$id" cursor)" "1" "advanced on working->idle edge"
assert_eq "$(task_get "$id" status)" "running" "still running mid-pipeline"

# last step completes -> done
st_set "$sess" @claude_state working; orch_tick
st_set "$sess" @claude_state idle;    st_set "$sess" @claude_state_at 2
orch_tick
assert_eq "$(task_get "$id" status)" "done" "done after final step idle"

finish
