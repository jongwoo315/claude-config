#!/usr/bin/env bash
. "$(dirname "$0")/lib.sh"
ORCH="$ORCH_ROOT/bin/orch"
export ORCH_WAIT_INTERVAL=0

repo="$ORCH_STATE/repo"; mkdir -p "$repo"
git -C "$repo" init -q && git -C "$repo" -c user.email=t@t -c user.name=t commit -q --allow-empty -m init
mk() { printf '{"id":"%s","target":"%s","status":"%s","session":""}\n' "$1" "$repo" "$2" > "$ORCH_QUEUE/task-$1.json"; }

mk d done
out=$("$ORCH" wait d); rc=$?
assert_eq "$rc" "0" "done + clean worktree exits 0"
assert_contains "$out" "DONE d $(git -C "$repo" rev-parse HEAD)" "prints DONE with HEAD"

mk f failed
out=$("$ORCH" wait f); assert_eq "$?" "2" "failed exits 2"

out=$("$ORCH" wait nope); assert_eq "$?" "3" "missing task exits 3"

# done but dirty -> keeps waiting until clean
mk w done; touch "$repo/dirty"
( sleep 1; rm -f "$repo/dirty" ) &
export ORCH_WAIT_INTERVAL=0.2
out=$("$ORCH" wait w); assert_eq "$?" "0" "dirty worktree waits, then exits 0 once clean"

finish
