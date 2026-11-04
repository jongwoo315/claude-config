#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
ORCH="$ORCH_ROOT/bin/orch"

id=$("$ORCH" add /tmp/projA "do a thing")
assert_contains "$id" "projA" "add echoes id"
assert_contains "$("$ORCH" ls)" "projA" "ls shows task"
assert_contains "$("$ORCH" ls)" "queued" "ls shows status"

pid=$("$ORCH" pipe /tmp/projB "s1" "s2" "s3")
. "$ORCH_ROOT/lib/task.sh"
assert_eq "$(task_steps_len "$pid")" "3" "pipe stores 3 steps"

"$ORCH" rm "$id" >/dev/null
assert_eq "$("$ORCH" ls | grep -c projA)" "0" "rm removes task"

# add with a single arg → prompt targets the current directory
wd=$(mktemp -d); cd "$wd"
cid=$("$ORCH" add "prompt only")
assert_eq "$(task_get "$cid" target)" "$wd" "add without dir targets cwd"
assert_eq "$(task_step "$cid" 0)" "prompt only" "single arg is the prompt"

# add tells the caller to arm `orch wait` — on stderr, so `$(orch add …)` still gets the bare id
err=$("$ORCH" add /tmp/projW "x" 2>&1 >/dev/null)
assert_contains "$err" "orch wait projW" "add hints orch wait on stderr"
wid=$(ORCH_TASK_ID=projW-review "$ORCH" add /tmp/projW "y" 2>/dev/null)
assert_eq "$wid" "projW-review" "stdout stays the bare id"
assert_contains "$("$ORCH" pipe /tmp/projP "s1" 2>&1 >/dev/null)" "orch wait projP" "pipe hints orch wait"

# add with no args at all → usage error
"$ORCH" add >/dev/null 2>&1
assert_eq "$?" "1" "add with no args exits 1"

finish
