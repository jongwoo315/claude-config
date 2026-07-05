#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
. "$ORCH_ROOT/lib/task.sh"

id=$(task_create /tmp/projA pipeline "step one" "step two")
assert_contains "$id" "projA" "id derived from dir basename"
assert_eq "$(task_get "$id" status)" "queued" "new task is queued"
assert_eq "$(task_get "$id" cursor)" "0" "cursor starts 0"
assert_eq "$(task_steps_len "$id")" "2" "two steps"
assert_eq "$(task_step "$id" 1)" "step two" "step by index"

task_set "$id" status running
assert_eq "$(task_get "$id" status)" "running" "status updated"

assert_contains "$(task_list_by_status queued)" "" "no queued left"
task_set "$id" status queued
assert_contains "$(task_list_by_status queued)" "$id" "lists queued ids"

finish
