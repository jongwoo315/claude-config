#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
. "$ORCH_ROOT/lib/task.sh"

# Two tasks share one worktree: the implementation loop and the review session
# dispatched into it afterwards. Without the override the second lands on the
# collision path and is labelled `<id>-1`, which does not say what it is.
impl=$(task_create /tmp/DEV-9999-foo single "impl")
assert_eq "$impl" "DEV-9999-foo" "id still derived from dir when no override"

rev=$(ORCH_TASK_ID="${impl}-review" task_create /tmp/DEV-9999-foo single "review")
assert_eq "$rev" "DEV-9999-foo-review" "ORCH_TASK_ID overrides the derived id"
assert_eq "$(jq -r '.steps[0]' "$ORCH_QUEUE/task-$rev.json")" "review" "override task written"
assert_eq "$(jq -r '.steps[0]' "$ORCH_QUEUE/task-$impl.json")" "impl" "impl task untouched"

# The collision suffix must still protect an overridden id from being reused.
rev2=$(ORCH_TASK_ID="${impl}-review" task_create /tmp/DEV-9999-foo single "review again")
assert_eq "$rev2" "DEV-9999-foo-review-1" "collision suffix still applies to an override"

finish
