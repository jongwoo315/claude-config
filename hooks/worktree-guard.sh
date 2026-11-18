#!/bin/bash
# PreToolUse:Bash — 세션 작업 폴더가 들어 있는 워크트리를 `git worktree remove`로 지우지 못하게 막는다.
#
# 2026-11-18 「부동산 에이전트」 세션이 #221 Phase D에서 자기 작업 폴더였던 워크트리
# (/Users/jw/prv/.wt/221-compare-reasons)를 같은 턴에 지웠다. 앱은 지워진 폴더를 계속 가리켜
# 「Working folder no longer exists」로 세션이 멈췄다. dev-workflow D3에 「폴더를 먼저 옮기고 턴을
# 끝낸 뒤 다음 턴에 지운다」는 규칙이 11-15부터 있었는데 따르지 않았다. 문장으로는 안 막혀서 훅으로 막는다.
#
# 세션 폴더로 보는 값: $CLAUDE_PROJECT_DIR(세션을 연 폴더)와 입력의 cwd(셸 위치) 둘 다.
# 지우려는 경로가 그중 하나와 같거나 그 위 폴더면 deny 한다.
#
# 자체 검사: worktree-guard.sh --test

trap 'exit 0' ERR

# git [-C dir] worktree remove [옵션...] <path> 에서 -C 값과 path 를 꺼낸다(0x1f로 구분 — 탭은 read가 앞 빈 칸을 삼킨다).
parse() {  # $1=명령 → "C<0x1f>PATH" 줄들
  python3 -c '
import shlex, sys
try:
    toks = shlex.split(sys.argv[1], posix=True)
except ValueError:
    sys.exit(0)
seps = {";", "&&", "||", "|", "&"}
i = 0
while i < len(toks):
    if toks[i] != "git":
        i += 1; continue
    j, cdir = i + 1, ""
    while j < len(toks) and toks[j].startswith("-") and toks[j] not in seps:
        if toks[j] == "-C" and j + 1 < len(toks):
            cdir = toks[j + 1]; j += 2
        else:
            j += 1
    if toks[j:j + 2] == ["worktree", "remove"]:
        k = j + 2
        while k < len(toks) and toks[k].startswith("-") and toks[k] not in seps:
            k += 1
        if k < len(toks) and toks[k] not in seps:
            print(cdir + "\x1f" + toks[k])
    i = j + 1
' "$1"
}

real() {  # 있으면 실제 경로, 없으면 그대로
  ( cd "$1" 2>/dev/null && pwd -P ) || printf '%s' "$1"
}

# 지우려는 경로 $1 이 세션 폴더 $2 와 같거나 그 위인가
covers() {
  local t s
  t=$(real "$1"); s=$(real "$2")
  [ -n "$t" ] && [ -n "$s" ] || return 1
  [ "$s" = "$t" ] || case "$s/" in "$t"/*) return 0 ;; *) return 1 ;; esac
}

if [ "${1:-}" = --test ]; then
  fail=0
  t=$(mktemp -d); mkdir -p "$t/repo" "$t/wt/sub"
  check() {  # 기대(deny|pass) 명령 세션폴더 셸위치
    local want=$1 cmd=$2 proj=$3 cwd=$4 got=pass
    out=$(printf '{"tool_input":{"command":%s},"cwd":"%s"}' "$(printf '%s' "$cmd" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read()))')" "$cwd" \
          | CLAUDE_PROJECT_DIR="$proj" "$0")
    printf '%s' "$out" | grep -q '"deny"' && got=deny
    [ "$got" = "$want" ] || { echo "FAIL($want≠$got): $cmd | proj=$proj cwd=$cwd"; fail=1; }
  }
  check deny "git worktree remove --force $t/wt" "$t/wt" "$t/repo"
  check deny "git worktree remove $t/wt" "$t/wt/sub" "$t/repo"
  check deny "git -C $t/repo worktree remove -f $t/wt" "$t/repo" "$t/wt"
  check deny "cd $t/repo && git worktree remove --force ../wt" "$t/wt" "$t/repo"
  check pass "git worktree remove --force $t/wt" "$t/repo" "$t/repo"
  check pass "git worktree list" "$t/wt" "$t/wt"
  check pass "echo git worktree remove" "$t/wt" "$t/wt"
  check pass "git worktree remove $t/wt-other" "$t/wt" "$t/wt"
  /bin/rm -rf "$t"
  [ "$fail" = 0 ] && echo ok
  exit "$fail"
fi

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$cmd" in *worktree*remove*) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

while IFS=$'\x1f' read -r cdir path; do
  [ -n "$path" ] || continue
  base=${cdir:-$cwd}
  # `cd X && git worktree remove ../y` 처럼 앞에서 cd 한 경우: 첫 cd 대상을 기준으로 본다
  if [ -z "$cdir" ]; then
    first_cd=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^;&|[:space:]]+).*/\1/p')
    [ -n "$first_cd" ] && base=$first_cd
  fi
  case "$path" in /*) target=$path ;; *) target="$base/$path" ;; esac
  for s in "${CLAUDE_PROJECT_DIR:-}" "$cwd"; do
    [ -n "$s" ] || continue
    if covers "$target" "$s"; then
      msg="This worktree contains the session folder ($s). Deleting it now leaves the app pointing at a folder that no longer exists. First move the session folder to the main repo (cd <repo> and mcp__ccd_directory__change_directory path=<repo>), end the turn, and run git worktree remove in the next turn (dev-workflow Phase D3)."
      jq -n --arg r "$msg" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
      exit 0
    fi
  done
done < <(parse "$cmd")
exit 0
