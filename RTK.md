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

**2026-08-18 rtk 0.45.0 실측 — 이 절의 옛 내용은 대부분 뒤집혔다.**
`rtk curl`·`rtk gh api`는 이제 **완전 passthrough**다. JSON/HTML/plain text 모두
raw와 바이트 동일(개행 1바이트 차)이고, curl은 1.38MB·gh api는 235KB까지
truncate도 `{ key: type }` 변환도 없다. `-u` basic auth도 정상이다.
절감이 0%라 `rtk-rewrite.sh`에서 **두 분기를 아예 뺐다** — curl과 gh api는
더 이상 rtk를 타지 않으므로 `| jq` 나 `> file`을 붙일 이유도 없다.

**자동 보호 (rtk-rewrite.sh hook):**

- `git status | grep ...` / `git diff | cat` / `git log ... | head` — 파이프·리다이렉션 감지 시 건너뜀
- `git status -- path/to/file` / `git diff -- path/to/file` — `--` 경로 지정 시 건너뜀
- `gh pr/issue/run ... | cat` — 파이프·리다이렉션 감지 시 건너뜀
- `/usr/bin/curl ...` 등 절대 경로 명령 — 의도적 bypass로 보고 건너뜀
- heredoc(`<<`)이 든 명령 — 건너뜀
- hook 에러 발생 시 → `trap 'exit 0' ERR`로 명령 실행 차단 없이 통과

이 규칙들은 **버그 우회가 아니라 설계상 필요하다.** rtk가 실제로 출력을 요약하기
때문이다 — `git status` 186 → 20 bytes, `git log` 274 → 89 bytes, `git diff`는
hunk 재포맷, `gh pr list`는 표 재포맷. downstream이 raw를 원하면 건너뛰어야 한다.

**살아있는 증상 (2026-08-18 재현됨):**

- `rtk ls -d src .venv` → **`.venv`가 조용히 사라진다.** exit 0, 경고 없음.
  하드코딩 `NOISE_DIRS`(`.venv` `node_modules` `dist` `build` `target` …) 필터가
  **명시한 인자에도** 적용된다. 인자가 **전부** 필터 대상이면 passthrough로
  빠져서 정상으로 보이는 탓에 단일 인자 테스트로는 안 잡힌다.
  - 우회 — `rtk ls -d -a src .venv` (`-a`면 복구) 또는 `/bin/ls -d ...`
  - RTK.md 옛 설명(`📊 0 files, 1 dirs` 변환)과 업스트림 #3207(locale 원인설)은
    **둘 다 원인이 아니다.** `LC_ALL=C`에서도 재현된다
- python3 리포트 테이블이 안 보임 — rtk가 아니라 Claude Code UI 문제 (아래 참조)

**고쳐진 증상 (0.45.0에서 재현 안 됨 — 우회 코드가 있으면 지워라):**

`body: string[761]` truncate · `jq: parse error` · 리다이렉트 시 JSON 변환 ·
Slack `not_authed`(`-d "$VAR"` 확장 깨짐) · `rtk proxy curl -u` 빈 출력 ·
`git log --format` 포맷 뭉갬 · `git ls-tree` 빈 출력 · `git show <c>:<p>` 2배 복제

업스트림 #1536·#1655는 closed 상태로 이 실측과 일치한다.

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

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

Refer to CLAUDE.md for full command reference.
