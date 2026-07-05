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

finish
