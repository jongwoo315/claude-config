#!/bin/bash
# PostToolUse:Edit|Write — 한국어 문체 검사
#
# 보고만 한다. 파일을 고치지 않는다 (--fix 안 씀).
# 규칙 원천은 rules/korean-style.md 의 교정 표 3개.
# 원뜻 사용이 정상인 말이 많아서 기계가 판정하면 안 된다.

trap 'exit 0' ERR
set -uo pipefail

LINT="$HOME/.claude/tools/kslint/lint.py"
LOG="$HOME/.claude/logs/kslint-hits.log"
PY=$(command -v python3 || echo /usr/bin/python3)

[ -f "$LINT" ] || exit 0

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
TOOL=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty')

[ -n "$FILE_PATH" ] || exit 0

case "$FILE_PATH" in
  *.md) ;;
  *) exit 0 ;;
esac

# 규칙 파일 자신과 남의 코드는 건너뛴다.
# korean-style.md 는 교정 대상 단어를 표에 담고 있어서 매번 자기 자신에 걸린다.
case "$FILE_PATH" in
  */rules/korean-style.md|*/node_modules/*|*/.git/*|*/plugins/marketplaces/*|*/.venv/*|*/site-packages/*)
    exit 0 ;;
esac

# Write 는 파일 전체, Edit 는 이번에 쓴 부분만 본다.
# 옛 파일 한 줄 고치는데 그 파일에 쌓인 빚이 다 쏟아지는 것을 막는다.
if [ "$TOOL" = "Edit" ]; then
  OUT=$(printf '%s' "$INPUT" | jq -r '.tool_input.new_string // empty' \
        | "$PY" "$LINT" - --tier 검토 2>/dev/null) || true
  WHERE="이번에 쓴 부분에서"
else
  [ -f "$FILE_PATH" ] || exit 0
  OUT=$("$PY" "$LINT" "$FILE_PATH" --tier 검토 2>/dev/null) || true
  WHERE="$FILE_PATH 에서"
fi

HITS=$(printf '%s\n' "$OUT" | grep -c '\[검토\]') || true
[ "${HITS:-0}" -gt 0 ] || exit 0

# 히트 로그 — 어떤 행이 계속 걸리는지 누적한다.
# 주간 sweep 이 이걸 읽어 「표에 올렸는데도 계속 쓰는 행」을 찾는다.
mkdir -p "$(dirname "$LOG")"
printf '%s\n' "$OUT" | grep '\[검토\]' | while IFS= read -r line; do
  word=$(printf '%s' "$line" | sed -E 's/.*\[검토\] ([^ ]+) .*/\1/')
  rid=$(printf '%s' "$line" | sed -E 's/.*· ([A-Z0-9.-]+)\).*/\1/')
  printf '%s\t%s\t%s\t%s\n' "$(date +%F)" "$word" "$rid" "$FILE_PATH" >> "$LOG"
done

{
  printf '한국어 문체 — %s %s건\n' "$WHERE" "$HITS"
  printf '%s\n' "$OUT" | grep '\[검토\]' | sed -E 's/^[^ ]+ +/  /' | head -12
  printf '\n고치거나, 원뜻 사용이 맞으면 그 줄 끝에 <!-- style-exempt --> 를 단다.\n'
  printf '규칙: ~/.claude/rules/korean-style.md\n'
} >&2
exit 2
