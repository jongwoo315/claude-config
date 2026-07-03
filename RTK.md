# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy (60-90% savings on dev operations)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
```

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## API 호출 시 주의

RTK는 curl/gh api 출력도 필터링하여 JSON을 `{ key: type }` 형태로 변환한다.
긴 문자열은 `string[761]`로 truncate되어 실제 내용을 읽을 수 없게 된다.

**자동 보호 (rtk-rewrite.sh hook):**

- `curl ... | jq` — 파이프(`|`) 감지 시 RTK 리라이트 건너뜀
- `curl ... > file.json` — 리다이렉션(`>`) 감지 시 RTK 리라이트 건너뜀
- `curl -u user:pass ...` — `-u` basic auth 감지 시 RTK 리라이트 건너뜀
- `gh api ... | jq` — 파이프 감지 시 RTK 리라이트 건너뜀
- `gh api ... > file.json` — 리다이렉션 감지 시 RTK 리라이트 건너뜀
- `gh pr/issue/run ... | cat` — 파이프/리다이렉션 감지 시 RTK 리라이트 건너뜀
- `git status -- path/to/file` — `--` 경로 지정 시 RTK 리라이트 건너뜀
- `git diff -- path/to/file` — `--` 경로 지정 시 RTK 리라이트 건너뜀
- `git status | grep ...` — 파이프/리다이렉션 감지 시 RTK 리라이트 건너뜀
- `git diff | cat` — 파이프/리다이렉션 감지 시 RTK 리라이트 건너뜀
- `git log ... | head` — 파이프/리다이렉션 감지 시 RTK 리라이트 건너뜀
- `/usr/bin/curl ...` — 절대 경로 명령은 RTK 리라이트 건너뜀 (의도적 bypass)
- hook 에러 발생 시 → `trap 'exit 0' ERR`로 명령 실행 차단 없이 통과

**자동 보호가 작동하지 않는 경우:**

`rtk proxy`는 hook rewrite는 bypass하지만 RTK 바이너리 자체의 필터링까지 완전히 우회하지 못할 수 있다.
최종 fallback은 시스템 바이너리 직접 호출:

```bash
# 1순위: 파이프/리다이렉트 추가 (hook이 자동 skip)
curl -s "https://..." | jq .
curl -s "https://..." > response.json

# 2순위: rtk proxy (hook bypass, 하지만 불완전할 수 있음)
rtk proxy curl -s "https://..." > response.json

# 3순위: 시스템 바이너리 직접 호출 (확실한 bypass)
/usr/bin/curl -s "https://..." > response.json
```

**긴 출력(리포트/테이블) 표시 이슈:**
Bash stdout과 Read tool 출력 모두 Claude Code UI에서 접힘("… +N lines (ctrl+o to expand)").
긴 결과물을 사용자에게 보여줘야 할 때는 **Claude 텍스트 응답으로 직접 출력**할 것:

```
# WRONG — 모두 UI에서 접힘
python3 report.py              # Bash stdout truncation
python3 report.py > out.txt    # Read tool도 접힘
python3 report.py | cat        # 동일

# CORRECT — 데이터를 JSON/파일로 저장 → Read로 읽은 후 → Claude 마크다운 텍스트로 직접 출력
python3 script.py > /tmp/data.json   # 데이터만 저장
# 그 후 Read tool로 읽고, Claude가 마크다운 테이블로 직접 출력
```

**흔한 증상:**

- `body: string[761]` — RTK가 긴 JSON 문자열을 truncate
- `jq: parse error` — RTK가 JSON 구조를 변환하여 파싱 실패
- 파일에 저장된 JSON이 `{ key: type }` 형태 — RTK 필터링이 리다이렉션에 적용됨
- python3 리포트 테이블이 보이지 않음 — `| cat` 없이 실행 시
- Slack API `not_authed` — RTK가 `-d "token=$SLACK_TOKEN"` 변수 확장을 망가뜨림
- `rtk proxy curl -u ...` → 빈 출력 — `rtk proxy`는 `-u` auth 응답을 제대로 처리 못함 (plain `curl -u` 사용 — hook이 자동 skip)
- `git log --format="%H %ad %s"` → truncation — RTK가 포맷된 출력을 필터링 (`| cat` 추가로 bypass)
- `git ls-tree <commit> <path>` → 빈 출력 — RTK가 출력을 먹음 (`git show <commit>:<path>` 로 대체)
- `git show <commit>:<path>` → 출력 2배 복제 — RTK가 내용을 중복 출력 (`git show <commit>:<path> | cat` 으로 bypass)
- `ls -d .venv/ venv/ ...` → 경로명 삭제됨 — RTK가 `📊 0 files, 1 dirs` 형태로 변환 (`find . -maxdepth 1 -name "venv" ... | cat` 사용)

**Slack API 호출 시 주의 (RTK 변수 확장 이슈):**

RTK proxy가 curl `-d` 파라미터의 `$VARIABLE` 확장을 방해할 수 있다.
Slack xoxp 토큰은 Bearer 헤더 인증이 안 되므로 form POST가 필수인데, RTK가 이를 깨뜨린다.

```bash
# WRONG — RTK가 $SLACK_TOKEN 확장을 망가뜨릴 수 있음
curl -s -X POST "https://slack.com/api/conversations.replies" \
  -d "token=$SLACK_TOKEN" -d "channel=$CH" -d "ts=$TS"

# CORRECT — 명시적 Content-Type + jq 파이프 (RTK auto-skip 트리거)
curl -s -X POST "https://slack.com/api/conversations.replies" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=$SLACK_TOKEN" -d "channel=$CH" -d "ts=$TS" \
  | jq .
```

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

Refer to CLAUDE.md for full command reference.
