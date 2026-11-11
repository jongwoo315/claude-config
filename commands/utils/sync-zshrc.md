# Sync .zshrc and .zshenv to Notion

Upload password-protected zips of `~/.zshrc` and `~/.zshenv` to Notion as separate files.

## Target

- **Page:** iTerm2
- **URL:** https://www.notion.so/jongwoo315/iTerm2-ab4c5445dede4062ab1fcb0a98e6ece0
- **Sections:** zshrc (heading_3), zshenv (heading_3)

## Usage

Run `/sync-zshrc` to create encrypted zips and upload to Notion.

## 비밀번호 처리 — 이 절차의 핵심 제약

**Claude는 zip 비밀번호를 받지 않는다.** AskUserQuestion으로 받아 `-P "<password>"`로
명령줄에 넣는 방식은 쓰지 않는다. 이유:

- 비밀번호가 대화 기록·shell 히스토리·프로세스 목록(`ps`)에 평문으로 남는다
- `~/.zshenv`에는 프로덕션 DB 비밀번호와 API 토큰 20여 개가 들어 있다.
  zip 비밀번호는 그 전부를 감싸는 마지막 방어선이라 노출되면 암호화 자체가 무의미해진다
- Claude는 평문 비밀번호를 다루지 않는다. 사용자가 허용해도 동일하다

**대신 `zip -e`가 직접 대화형으로 묻게 한다.** 입력이 화면에 찍히지 않고 어디에도 안 남는다.
결과물은 동일하다 — 같은 ZipCrypto, 같은 파일명, 같은 경로.

**이 한 줄은 진짜 터미널 탭에서 실행해야 한다.** Bash 도구는 물론이고 프롬프트의 `!` 접두사도
tty를 주지 않는다 (`!`는 Claude Code 세션 안에서 비대화형으로 돈다). tty가 없으면 `zip -e`가
비밀번호를 물을 곳이 없어 다음과 같이 죽는다:

```
zip error: Invalid command arguments (stderr is not a tty)
```

`!`로 시켜놓고 성공을 가정하지 말 것 — 실패하면 zip은 안 생기고 **평문 사본이 `/tmp`에
그대로 남는다.** Step 2 뒤에 반드시 Step 3의 검증을 돌린다.

## Process

**Step 1 — Claude가 실행:** 평문 사본 준비

```bash
/bin/rm -f /tmp/zshrc.zip /tmp/zshenv.zip /tmp/zshrc /tmp/zshenv

cp ~/.zshrc  /tmp/zshrc
cp ~/.zshenv /tmp/zshenv
chmod 600 /tmp/zshrc /tmp/zshenv     # zip 만들기 전까지 평문이 /tmp에 있다
```

**`rm`은 전부 `/bin/rm`으로 쓴다.** 셸의 `rm`은 rm-safely 래퍼라 파일을 `~/.local/share/Trash`로
옮길 뿐 지우지 않는다. `rm -f zshenv`로 쓰면 DB 비밀번호가 든 평문이 휴지통에 남는다.

**Step 2 — 사용자가 실행:** 아래를 제시하고 **iTerm 새 탭(⌘T)에 붙여넣게** 한다.
`!` 접두사를 붙이라고 하지 말 것 (위 "비밀번호 처리" 참조).

```bash
cd /tmp && zip -e zshrc.zip zshrc && zip -e zshenv.zip zshenv && /bin/rm -f zshrc zshenv && /bin/ls -lh /tmp/*.zip
```

`zip -e`가 파일마다 비밀번호를 두 번(입력·확인) 묻는다. 두 파일에 같은 비밀번호를 쓴다.
`/bin/rm -f zshrc zshenv`가 평문 사본을 지운다 — 이 부분을 빠뜨리지 말 것.

**Step 3 — Claude가 검증:** 사용자가 끝났다고 하면 실행한다. "did it"을 그대로 믿지 않는다.

```bash
echo "=== zips:"; ls -l /tmp/zshrc.zip /tmp/zshenv.zip 2>&1
echo "=== plaintext leftovers:"; ls -l /tmp/zshrc /tmp/zshenv 2>&1
for f in /tmp/zshrc.zip /tmp/zshenv.zip; do
  echo "--- $f"
  unzip -t -P "definitely-not-the-password" "$f" 2>&1 | tail -2
done
```

통과 조건 셋 다 충족해야 한다:

| 확인 | 통과 신호 |
| --- | --- |
| zip 생성 | 두 파일 모두 존재, 크기 > 0 |
| 평문 제거 | `/tmp/zshrc`, `/tmp/zshenv` → `No such file` |
| 실제 암호화 | `unzip -t`가 `incorrect password`로 거부 |

`unzip -l`은 암호화 여부를 안 보여준다 — 목록만 보고 통과 처리하지 말 것.
틀린 비밀번호로 `-t`를 걸어야 암호화가 실증된다. (`-t`는 테스트만 하고 파일을 안 푼다.)

**Step 4 — Claude가 업로드:** Notion File Upload API로 올려 각 heading 바로 아래에 붙인다

```bash
N="$HOME/.claude/tools/notion-api/notion-api"; CAP=$(date +%y%m%d)
for pair in zshrc:e0fad982-ba70-40da-88d2-9900f736c31e zshenv:31141e61-65c0-806b-ba1e-ee42c17efc68; do
  name=${pair%%:*}; heading=${pair#*:}
  id=$("$N" upload /tmp/$name.zip application/zip | cut -d' ' -f1)
  python3 -c 'import json,sys; print(json.dumps({"children":[{"type":"file","file":{"type":"file_upload","file_upload":{"id":sys.argv[1]},"caption":[{"text":{"content":sys.argv[3]}}]}}],"position":{"type":"after_block","after_block":{"id":sys.argv[2]}}}))' "$id" "$heading" "$CAP" \
    | "$N" PATCH /v1/blocks/ab4c5445dede4062ab1fcb0a98e6ece0/children - | jq -r '.results[0] | "\(.id) \(.file.name)"'
done
```

- 캡션은 `YYMMDD`(옛 블록과 같은 형식). 옛 파일 블록은 지우지 않는다 — 지울지는 jw가 정한다
- 올린 뒤 각 블록의 `file.file.url`을 내려받아 `/tmp/*.zip`과 `shasum -a 256`을 맞춰 본다. 응답의 `uploaded`만 보고 끝내지 않는다

## Output

1. `/tmp/zshrc.zip`, `/tmp/zshenv.zip` (비밀번호 보호, Step 3에서 검증됨)
2. `/tmp` 평문 사본 제거됨
3. Notion iTerm2 페이지의 zshrc·zshenv heading 바로 아래에 새 파일 블록 (체크섬 확인됨)

## Notes

- 암호화는 표준 `zip -e` = **ZipCrypto**. 알려진 평문 공격에 취약하다.
  `export NOTION_API_KEY=` 같은 예측 가능한 문자열이 안에 있어 특히 그렇다.
  Notion 계정이 안전한 한 실질 위험은 낮지만, 강화하려면 AES로 바꾼다:
  `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in zshenv -out zshenv.enc`
  (복호화: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in zshenv.enc -out zshenv`)
- heading 블록 id: zshrc `e0fad982-ba70-40da-88d2-9900f736c31e`, zshenv `31141e61-65c0-806b-ba1e-ee42c17efc68`
- **zshrc·zshenv heading_3 섹션은 둘 다 이미 존재한다** (2026-08-03 확인). 새로 만들 필요 없다.
  올리기 전 확인하려면:

  ```bash
  "$HOME/.claude/tools/notion-api/notion-api" GET "/v1/blocks/ab4c5445dede4062ab1fcb0a98e6ece0/children?page_size=100" \
    | jq -r '.results[] | select(.type|test("heading_3|file")) | .type'
  ```
- 업로드는 `notion-api upload FILE [CONTENT_TYPE]`(file_upload 생성 + `/send`)가 한다. 2026-11-11 이전 문구는
  「Notion API는 파일 업로드를 지원하지 않아 드래그가 필수」였다 — 그날 API로 올리고 체크섬으로 확인했다.
  계기: jw가 회사 맥에서 리모트로 이 맥 미니를 쓰고 있어 Finder 드래그를 할 수 없었다
