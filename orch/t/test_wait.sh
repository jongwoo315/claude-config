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

# BG_STUCK 은 백그라운드가 남은 「동안」으로 잰다. @claude_state_at 은 상태가 바뀐 시각이라
# ralph 루프에서는 루프 시작 시각 그대로 남는다(2026-11-03 DEV-10654: 시작 25분 뒤 bg 가
# 생기자마자 BG_STUCK 25, 다시 건 wait 도 즉시 끝남). 오래된 state_at 이 판정을 당기면 안 된다.
sess=bgsess; $ORCH_TMUX new-session -d -s "$sess"
$ORCH_TMUX set-option -t "$sess" @claude_bg 1
$ORCH_TMUX set-option -t "$sess" @claude_state_at 1
mkr() { printf '{"id":"%s","target":"%s","status":"%s","session":"%s"}\n' "$1" "$repo" "$2" "$sess" > "$ORCH_QUEUE/task-$1.json"; }
export ORCH_WAIT_INTERVAL=0.2 ORCH_WAIT_BG_STALE=3
mkr r running
( sleep 1; mkr r done ) &
out=$("$ORCH" wait r); rc=$?
assert_eq "$rc" "0" "old state_at with fresh bg does not trip BG_STUCK"

export ORCH_WAIT_BG_STALE=1
mkr s running
out=$("$ORCH" wait s); rc=$?
assert_eq "$rc" "4" "bg held past stale window still reports BG_STUCK"
assert_contains "$out" "BG_STUCK s" "prints BG_STUCK"

finish
