#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
ORCH="$ORCH_ROOT/bin/orch"; . "$ORCH_ROOT/lib/task.sh"

"$ORCH" add --each /tmp/a /tmp/b /tmp/c "same prompt" >/dev/null
assert_eq "$("$ORCH" ls | grep -cE ' (a|b|c) ')" "3" "--each makes 3 tasks"

id=$("$ORCH" add --safe /tmp/s "careful")
assert_eq "$(task_get "$id" skip_perms)" "false" "--safe sets skip_perms=false"

finish
