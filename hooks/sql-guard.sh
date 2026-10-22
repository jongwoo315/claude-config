#!/bin/bash
# PreToolUse:Bash — DB에 쓰는 SQL과 plab prod DB 직접 접속을 멈춘다.
#
# 예전에는 settings.json 안의 인라인 훅 두 줄이었고 늘 ask 를 냈다. rm-guard.sh 를 고칠
# 때(2026-10-20) 같이 안 옮겨져서, 무인 orch 세션이 테스트 DB DROP 에서 답할 사람 없는
# 확인 창에 9시간 멈췄다(2026-10-22 #101 cli-packaging, 00:20~09:20).
#
# 판별은 rm-guard.sh 와 같다 — 대화형 세션 → ask. orch 세션(tmux 세션명 claude-orch-*)
# → deny + 사유. 판별 방식을 훅마다 다르게 두면 한쪽만 고쳐지는 일이 또 생긴다.
#
# 자체 검사: sql-guard.sh --test

trap 'exit 0' ERR

PROD='mysql.*(-P[[:space:]]*13035|:13035|rds-prod[^-]).*-D[[:space:]]*plab'
CLIENT='(mysql|psql)'
WRITE='(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE)[[:space:]]'

# 걸리면 사유(영문)를 찍는다. 안 걸리면 아무것도 안 찍는다.
match() {
  if printf '%s' "$1" | grep -qE "$PROD"; then
    echo 'Direct connection to plab production DB detected'
  elif printf '%s' "$1" | grep -qiE "$CLIENT" && printf '%s' "$1" | grep -qiE "$WRITE"; then
    echo 'CUD SQL operation detected'
  fi
}

if [ "${1:-}" = --test ]; then
  fail=0
  for c in "docker exec upgrade-impact-rag-db-1 psql -U bumpcheck -d postgres -c 'DROP DATABASE \"x_test\"'" \
           'mysql --defaults-extra-file=/tmp/.my.cnf -e "delete from t where id=1;"' \
           'psql -c "CREATE TABLE t (id int)"' \
           'mysql -h h -P 13035 -D plab -e "select 1"'; do
    [ -n "$(match "$c")" ] || { echo "MISS: $c"; fail=1; }
  done
  for c in 'psql -c "select * from t"' 'mysql -e "SHOW TABLES;"' 'echo DROP TABLE t' \
           'git commit -m "update docs"'; do
    [ -n "$(match "$c")" ] && { echo "FALSE HIT: $c"; fail=1; }
  done
  [ "$fail" = 0 ] && echo ok
  exit "$fail"
fi

cmd=$(jq -r '.tool_input.command // empty')
reason=$(match "$cmd")
[ -n "$reason" ] || exit 0

sess=""
[ -n "${TMUX_PANE:-}" ] && sess=$(tmux display-message -p -t "$TMUX_PANE" '#{session_name}' 2>/dev/null)
case "$sess" in
  claude-orch-*)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s — blocked in unattended orch sessions (nobody can confirm it). Do not run it; leave it and mention it in the PR."}}\n' "$reason" ;;
  *)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"%s — confirm?"}}\n' "$reason" ;;
esac
exit 0
