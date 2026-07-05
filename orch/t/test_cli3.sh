#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
export ORCH_QUEUE="$(mktemp -d)/queue"; mkdir -p "$ORCH_QUEUE"
ORCH="$ORCH_ROOT/bin/orch"

# logs on a queued (not started) task -> friendly error, nonzero exit
id=$("$ORCH" add /tmp/q "x")
out=$("$ORCH" logs "$id" 2>&1); rc=$?
assert_eq "$rc" "1" "logs on not-started task exits 1"
assert_contains "$out" "not started" "logs explains task not started"

# rm with no id -> usage error, nonzero exit, and does not delete anything
before=$(find "$ORCH_QUEUE" -name 'task-*.json' | wc -l | tr -d ' ')
out=$("$ORCH" rm 2>&1); rc=$?
assert_eq "$rc" "1" "rm with no id exits 1"
after=$(find "$ORCH_QUEUE" -name 'task-*.json' | wc -l | tr -d ' ')
assert_eq "$after" "$before" "rm with no id deletes nothing"

# invalid --max is rejected (no daemon started, nonzero exit)
out=$("$ORCH" start --max abc 2>&1); rc=$?
assert_eq "$rc" "1" "start --max abc rejected"
assert_contains "$out" "invalid --max" "explains invalid max"
[ ! -f "$ORCH_ROOT/daemon.pid" ] && ok "no pidfile written on invalid max" || { fail "pidfile written despite invalid max"; rm -f "$ORCH_ROOT/daemon.pid"; }

finish
