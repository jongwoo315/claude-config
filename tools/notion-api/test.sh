#!/usr/bin/env bash
# notion-api 테스트. 실행: bash tools/notion-api/test.sh
# NOTION_API_LIVE=1 이면 GET /v1/users/me 를 실제로 부른다.
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
T="$DIR/notion-api"
REPO="$(cd "$DIR/../.." && pwd)"
pass=0; fail=0

check() { # 이름, 기대값, 실제값
  if [ "$2" = "$3" ]; then pass=$((pass + 1)); echo "ok   $1"
  else fail=$((fail + 1)); echo "FAIL $1"; echo "     expected: $2"; echo "     actual:   $3"; fi
}

dry() { NOTION_API_ZSHENV=/nonexistent NOTION_API_DRY_RUN=1 NOTION_API_KEY=x PLAB_WOZ_NOTION_API_KEY=y "$T" "$@" 2>&1; }

# 메서드·URL·버전
check "GET dry-run" \
  "GET https://api.notion.com/v1/users/me version=2026-03-11 key=NOTION_API_KEY from=env body=0" \
  "$(cd /tmp && dry GET /v1/users/me)"
check "DELETE dry-run" \
  "DELETE https://api.notion.com/v1/blocks/abc version=2026-03-11 key=NOTION_API_KEY from=env body=0" \
  "$(cd /tmp && dry DELETE /v1/blocks/abc)"

# 본문: 파일과 stdin
tmp=$(mktemp); printf '{"page_size":1}' > "$tmp"
check "POST file body" \
  "POST https://api.notion.com/v1/data_sources/ds1/query version=2026-03-11 key=NOTION_API_KEY from=env body=15" \
  "$(cd /tmp && dry POST /v1/data_sources/ds1/query "$tmp")"
check "PATCH stdin body" \
  "PATCH https://api.notion.com/v1/pages/p1 version=2026-03-11 key=NOTION_API_KEY from=env body=15" \
  "$(cd /tmp && printf '{"page_size":1}' | dry PATCH /v1/pages/p1 -)"
rm -f "$tmp"

# ds 하위 명령
check "ds dry-run" \
  "GET https://api.notion.com/v1/databases/db1 version=2026-03-11 key=NOTION_API_KEY from=env body=0" \
  "$(cd /tmp && dry ds db1)"

# 키 고르기: --work, 회사 디렉터리
check "--work picks work key" \
  "GET https://api.notion.com/v1/users/me version=2026-03-11 key=PLAB_WOZ_NOTION_API_KEY from=env body=0" \
  "$(cd /tmp && dry --work GET /v1/users/me)"
if [ -d "$HOME/plab" ]; then
  check "cwd under ~/plab picks work key" \
    "GET https://api.notion.com/v1/users/me version=2026-03-11 key=PLAB_WOZ_NOTION_API_KEY from=env body=0" \
    "$(cd "$HOME/plab" && dry GET /v1/users/me)"
else
  echo "skip cwd under ~/plab (no such dir)"
fi

# 잘못된 입력은 종료 코드 2
(cd /tmp && NOTION_API_DRY_RUN=1 "$T" GET pages/x >/dev/null 2>&1); check "path without /v1 exits 2" 2 "$?"
(cd /tmp && NOTION_API_DRY_RUN=1 "$T" FETCH /v1/pages/x >/dev/null 2>&1); check "unknown method exits 2" 2 "$?"
(cd /tmp && NOTION_API_DRY_RUN=1 "$T" POST /v1/pages /no/such/file >/dev/null 2>&1); check "missing body file exits 2" 2 "$?"

# 키가 비면 변수 이름만 말하고 종료 코드 2
out=$(cd /tmp && NOTION_API_ZSHENV=/nonexistent NOTION_API_KEY= "$T" GET /v1/users/me 2>&1); code=$?
check "empty key exits 2" 2 "$code"
check "empty key names the variable" "notion-api: NOTION_API_KEY is empty" "$out"

# 키는 ~/.zshenv가 환경변수보다 우선한다 — 환경변수는 세션 시작 때 값이라 오래됐을 수 있다
zf=$(mktemp); echo 'export NOTION_API_KEY="from_file"' > "$zf"
out=$(cd /tmp && NOTION_API_ZSHENV="$zf" NOTION_API_DRY_RUN=1 NOTION_API_KEY=from_env "$T" GET /v1/users/me)
check "zshenv wins over env" \
  "GET https://api.notion.com/v1/users/me version=2026-03-11 key=NOTION_API_KEY from=zshenv body=0" "$out"
echo 'export OTHER=1' > "$zf"
out=$(cd /tmp && NOTION_API_ZSHENV="$zf" NOTION_API_DRY_RUN=1 NOTION_API_KEY=from_env "$T" GET /v1/users/me)
check "env used when zshenv lacks the key" \
  "GET https://api.notion.com/v1/users/me version=2026-03-11 key=NOTION_API_KEY from=env body=0" "$out"
rm -f "$zf"

# 키 값이 출력에 나오지 않는다
out=$(cd /tmp && NOTION_API_DRY_RUN=1 NOTION_API_KEY=secret_should_not_print "$T" GET /v1/users/me 2>&1)
case "$out" in *secret_should_not_print*) check "key value never printed" no yes ;; *) check "key value never printed" ok ok ;; esac

# repo 검사 — Notion REST 호출은 이 폴더 밖에 없어야 한다 (#145 jw 기준)
calls=$(git -C "$REPO" ls-files | grep -v '^tools/notion-api/' \
  | (cd "$REPO" && xargs grep -nE 'api\.notion\.com|Notion-Version') | wc -l | tr -d ' ')
check "no direct Notion URL or version outside tools/notion-api" 0 "$calls"
keys=$(git -C "$REPO" ls-files | grep -v '^tools/notion-api/' \
  | (cd "$REPO" && xargs grep -nE 'Authorization: Bearer \$(NOTION|PLAB_WOZ_NOTION)|NOTION_API_KEY=\$\(') | wc -l | tr -d ' ')
check "no direct Notion key handling outside tools/notion-api" 0 "$keys"

if [ "${NOTION_API_LIVE:-}" = 1 ]; then
  obj=$(cd /tmp && "$T" GET /v1/users/me | python3 -c 'import sys,json; print(json.load(sys.stdin).get("object"))')
  check "live GET /v1/users/me" user "$obj"
fi

echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
