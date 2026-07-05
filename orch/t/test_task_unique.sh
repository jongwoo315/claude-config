#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
. "$ORCH_ROOT/lib/task.sh"

a=$(task_create /tmp/p single "first")     # p-0
b=$(task_create /tmp/p single "second")    # p-1
rm -f "$ORCH_QUEUE/task-$a.json"           # remove p-0, count drops to 1
c=$(task_create /tmp/p single "third")     # must NOT reuse p-1

# c must be a distinct id from b, and b's file/content must be intact
[ "$c" != "$b" ] && ok "new id distinct from existing ($c != $b)" || { fail "id collision: $c == $b"; }
assert_eq "$(jq -r '.steps[0]' "$ORCH_QUEUE/task-$b.json")" "second" "existing task b not overwritten"
assert_eq "$(jq -r '.steps[0]' "$ORCH_QUEUE/task-$c.json")" "third" "new task c written"

finish
