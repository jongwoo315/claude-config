#!/usr/bin/env bash
# Test harness: dependency-free asserts + isolated tmux server.
set -u
export ORCH_TMUX="tmux -L orch_test"
ORCH_ROOT="$HOME/.claude/orch"   # code location (lib/, bin/) — tests source from here
# Isolate all mutable state to a temp dir so a live production daemon / real
# queue can't pollute the suite (and vice versa). Code still lives in ORCH_ROOT.
ORCH_STATE="$(mktemp -d "${TMPDIR:-/tmp}/orch_test.XXXXXX")"
export ORCH_QUEUE="$ORCH_STATE/queue"
export ORCH_PIDFILE="$ORCH_STATE/daemon.pid"
mkdir -p "$ORCH_QUEUE"

_fail=0
ok()      { printf '  ok   - %s\n' "$1"; }
fail()    { printf '  FAIL - %s\n' "$1"; _fail=1; }
assert_eq()       { [ "$1" = "$2" ] && ok "$3" || { fail "$3"; printf '        want=[%s] got=[%s]\n' "$2" "$1"; }; }
assert_contains() { case "$1" in *"$2"*) ok "$3";; *) fail "$3"; printf '        [%s] !contains [%s]\n' "$1" "$2";; esac; }

test_teardown() {
  $ORCH_TMUX kill-server 2>/dev/null || true
  [ -n "${ORCH_STATE:-}" ] && rm -rf "$ORCH_STATE"
}
trap test_teardown EXIT
finish() { return $_fail; }
