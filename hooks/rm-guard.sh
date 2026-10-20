#!/bin/bash
# PreToolUse:Bash — 재귀 삭제(rm -r / -rf / -fr / -Rf / --recursive)만 멈춘다.
#
# 예전 훅은 \brm\b 를 다 잡아서 `orch rm`·`git rm`·`docker --rm`·파일 한 개 삭제에도
# 확인 창을 띄웠다. 그리고 ask 는 --dangerously-skip-permissions 보다 우선해서, 무인
# orch 세션이 답할 사람 없는 창에서 밤새 멈췄다(2026-10-20 140-upgrade-compare, 00:53~).
#
# 대화형 세션 → ask. orch 세션(tmux 세션명 claude-orch-*) → deny + 사유.
# deny 면 루프가 사유를 받고 다른 길로 계속 간다. ask 면 영영 멈춘다.
#
# 못 잡는 것: find -delete, git clean, shutil.rmtree. 예전 훅도 못 잡았다.
# 자체 검사: rm-guard.sh --test

trap 'exit 0' ERR

# rm 이 명령 자리에 있고(앞이 줄 시작·공백·; & | ( ` — `--rm` 은 제외), 같은 단순
# 명령 안에 r/R 이 든 짧은 옵션 묶음이나 --recursive 가 있으면 재귀 삭제다.
RECURSIVE='(^|[[:space:];&|(`])rm[[:space:]]+([^;&|]*[[:space:]])?(-[a-zA-Z]*[rR][a-zA-Z]*|--recursive)([[:space:]]|$)'

if [ "${1:-}" = --test ]; then
  fail=0
  for c in 'rm -rf build' 'rm -fr x' 'rm -Rf x' 'rm --recursive x' 'cd a && rm -r b' \
           'sudo rm -rf /tmp/x' 'ls; rm -r x' 'rm -f a -r'; do
    printf '%s' "$c" | grep -qE "$RECURSIVE" || { echo "MISS: $c"; fail=1; }
  done
  for c in 'rm a.xml b.diff' 'rm -f a.xml' 'rm *.log' 'orch rm 140' 'docker run --rm -it img' \
           'docker run --rm --restart no img' 'rm my-report.txt' 'git rm -f x' 'echo firm -r'; do
    printf '%s' "$c" | grep -qE "$RECURSIVE" && { echo "FALSE HIT: $c"; fail=1; }
  done
  [ "$fail" = 0 ] && echo ok
  exit "$fail"
fi

cmd=$(jq -r '.tool_input.command // empty')
printf '%s' "$cmd" | grep -qE "$RECURSIVE" || exit 0

sess=""
[ -n "${TMUX_PANE:-}" ] && sess=$(tmux display-message -p -t "$TMUX_PANE" '#{session_name}' 2>/dev/null)
case "$sess" in
  claude-orch-*)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Recursive rm is blocked in unattended orch sessions (nobody can confirm it). Delete the specific files without -r, or leave the directory and mention it in the PR."}}' ;;
  *)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"recursive rm detected — confirm deletion?"}}' ;;
esac
exit 0
