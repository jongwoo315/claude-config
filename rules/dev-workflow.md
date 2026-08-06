## Development Workflow

개발 작업 시작 시 `dev-workflow` 스킬을 사용할 것.

**적용 범위: 모든 개발 작업.** `~/plab`·`~/work` 업무든 `~/prv` 개인 프로젝트든 예외 없다.
디렉터리에 따라 **레이어만 치환**하고 파이프라인·게이트·실행 모드는 동일하다.

| 레이어 | `~/plab`, `~/work` | `~/prv` |
| --- | --- | --- |
| 티켓 시스템 | Jira (`DEV-XXXX`) | Notion 프로젝트 진행 DB `29241e61-65c0-801f-9529-cabf8cad919b` (`#NN`) |
| 티켓 스킬 | `setup-work` | `personal-setup-work` |
| worktree 주차장 | `~/plab/.wt/DEV-XXXX-<subject>` | `~/prv/.wt/<NN>-<subject>` |
| 브랜치 | `DEV-XXXX-<subject>` | `feat/<NN>-<subject>` |
| GitHub 계정 / 커밋 이메일 | `kimwoz` / `$PLAB_WORK_EMAIL` | `jongwoo315` / `jongwoo315@gmail.com` |
| 티켓 필드 갱신 | Jira 상태 | Notion `상태`·`작업일`·`Git 저장소`·`Git 브랜치`·`PR` **전부** |
| PR 승인 | 리뷰어 approve | 1인 레포라 **self-review는 `--comment`만 가능** — `--approve`와 `--request-changes` 둘 다 GitHub이 거부한다 (`Can not request changes on your own pull request`). merge 차단 안전망이 없으므로 미해결 Critical은 사람이 기억해야 한다 |

**실행 모드는 양쪽 동일 — orch detached ralph-loop, 예외 없음.** `~/prv`가 학습·포트폴리오
목적이라고 해서 대화형으로 내려오지 않는다. 과정 경험이 아니라 **검증 기준을 정하는 능력**이
산출물이기 때문이다 (`rules/portfolio-judgment.md`). 사람의 개입은 Kickoff(plan 승인)와
PR 리뷰 두 지점뿐이다.

**`~/prv`에서 plan이 오히려 더 중요해진다.** 통과 기준·의도적 비목표·불통과 신호가 plan에
없으면 ralph는 "동작하는 코드"만 만들고 끝난다. Kickoff 게이트에서 이 3줄을 반드시 확인할 것.

**dev-workflow 실행 규칙 (autonomous pipeline):**

- dev-workflow는 **2개 게이트만 동기 확인**한다: Kickoff(plan 승인 go/adjust/cancel) + PR 리뷰(async).
  나머지 단계(parse, ticket, worktree, brainstorm, explore, plan, TDD 구현, verify, commit, PR 생성)는
  무인 자동 진행. Phase A에서 AskUserQuestion 금지.
- Pre-PR 체크(env var, 서버 기동, 전체 테스트)는 게이트가 아니라 ralph-loop completion-promise 조건.
  출력 없이 pass 가정 금지, 조용한 skip 금지.
- 판단 로그는 아래 별도 절 참조 — **이 항목만 dev-workflow 파이프라인 밖에서도 발동한다.**
- 상세 절차는 `dev-workflow` 스킬 참조. **모든 티켓은 orch detached ralph-loop으로 실행** — 단일 실행
  모드, 예외 없음. main 세션은 순수 dispatcher (ticket 작업 실행 안 함, 점유 금지).
- **worktree 위치: `~/plab/.wt/DEV-XXXX-<subject>`** (repo sibling 아닌 중앙 주차장). repo prefix
  금지 — 브랜치 suffix 그대로. `~/plab/` 하위라 mode/계정/이메일 규칙이 자동 work/kimwoz/
  plabfootball로 해석 — 별도 처리 불필요.
  **`~/prv` 프로젝트는 `~/prv/.wt/<NN>-<subject>`** (예: `~/prv/.wt/104-db-schema`). 마찬가지로
  `~/prv/` 하위라 계정/이메일이 자동 jongwoo315/jongwoo315@gmail.com으로 해석된다.
- **네이밍 단일화 — worktree 디렉터리명이 체인 전체의 single source of truth.**
  `~/plab/.wt/DEV-7133-corpus` → orch id `DEV-7133-corpus` → tmux 세션 `claude-orch-DEV-7133-corpus`
  → claude `--name DEV-7133-corpus`. 디렉터리에 repo prefix가 붙으면 하위 라벨이 전부 어긋난다.
- **라이브 키/측정 작업도 ralph로 처리** — 키를 worktree env(.env symlink)에 넣으면 헤드리스 세션이 embed·
  eval·측정을 직접 실행한다. 별도 driver/attended 모드 없음 (구 개념 폐기 — 사람은 PR만 판단, 실행 중간
  개입 안 함).
- **하드 에러 fail-fast:** plan 헤더에 "insufficient_quota·401 등 재시도 무의미한 하드 에러 시 RALPH_DONE
  방출·PR 생성 말고 즉시 stop (스핀 금지)" 명시. TPM 429는 코드 페이싱+백오프로 자가치유. billing 수정은
  어차피 사람 몫이라 orch 완료 알림(실패)로 발견.
- **일시 에러도 지속되면 하드로 친다.** 429·529가 계속 뜨면서 **20분간 커밋·파일 변경이 0이면 동일하게
  중단**. 무인 루프에서는 기다리는 것과 스핀하는 것이 구분되지 않는다 — 화면을 보는 사람이 없고, 루프는
  실패한 턴 뒤에 프롬프트를 다시 밀어넣는다. 서버 과부하 하나가 반복 예산을 통째로 태우는데 picker는
  `working`으로 보인다 (2026-08-06 #89에서 24분 무진전, 사람이 화면을 봐서야 발견).
  **이건 plan 텍스트일 뿐 강제 장치가 아니다** — 모델이 스스로 시간을 재야 한다. 확실히 잡으려면
  orch 데몬이 `@claude_state_at`과 워크트리 mtime으로 stuck 판정을 해야 한다 (미구현).

**⚠️ PR 존재는 완료 신호가 아니다:**

- ralph 루프는 **PR을 만든 뒤에도 계속 일한다** — 커밋 전 `superpowers:requesting-code-review`,
  PR 생성 후 `pr-review-toolkit:review-pr`을 돌려 지적사항을 추가 커밋으로 얹는다.
  실측: PR 생성 후 8분 넘게 작업 지속.
  내장 `/code-review`는 품질이 더 낫지만 **사람이 직접 치는 커맨드라 모델이 호출할 수 없다**
  (헤드리스 available-skills에 없음). 무인 루프 안에서는 위 둘만 쓴다.
- **완료 판정 = `orch ls`가 `done` + 워크트리 `git status --porcelain`이 빈 것.**
  PR URL이나 Notion `PR` 컬럼이 찼다고 완료가 아니다.
- orch가 `running`인 동안 PR을 리뷰하지 말 것 — 리뷰 도중 커밋이 얹혀 대상이 어긋난다.
- 같은 이유로 **산출물이 그럴듯할수록 확인을 건너뛰기 쉽다.** PR 본문에 테스트 수와 통과 기준
  표가 있어도 그건 루프의 주장이지 완료 증거가 아니다 (`rules/portfolio-judgment.md`의
  "동작한다로 완료 보고하지 않는다"가 자기 자신에게도 적용된다).

**orch daemon stale 코드 주의:**

- daemon은 `orch/lib/*.sh`를 **메모리에 물고 돈다.** `~/.claude` sync 후나 orch 코드 수정 후
  첫 dispatch 전에 `orch stop && ORCH_STUCK_SECS=7200 orch start --max 3`로 재시작할 것.
- 증상: status는 `running`인데 tmux 세션이 없고 `orch logs <id>`가 `can't find pane`을 뱉는다.
  `jq -r '.session' ~/.claude/orch/queue/task-<id>.json`이 id와 다르면 확정.
- 복구: 아래 "재 dispatch 전 고아 프로세스 확인"을 반드시 거칠 것.

**⚠️ 재 dispatch 전 고아 프로세스 확인 (필수):**

`orch rm`은 **큐 항목과 tmux 세션만 정리하고 claude 프로세스는 죽이지 않는다.** 세션이 죽어도
claude는 고아로 살아남아 같은 worktree에 계속 쓴다. 이 상태에서 재 dispatch하면
**한 worktree에 에이전트 2개**가 붙어 서로의 DB·파일을 깨뜨린다 (실제 발생함 — 두 번째 세션이
같은 DB에 pytest를 돌리면 첫 번째 작업이 오염된다).

```bash
# worktree에 붙은 claude 프로세스 전수 확인
ps aux | grep "claude --dangerously" | grep -v grep | awk '{print $2}' | while read p; do
  echo "$p  $(lsof -p $p -a -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)"
done
```

대상 worktree가 cwd인 PID가 있으면 **kill 후에 재 dispatch**한다.
`orch rm <id>` → 위 확인 → `kill <pid>` → `tmux kill-session -t claude-orch-<id>` → 재 dispatch.

> 자기 자신(main 세션)의 cwd가 repo 루트로 잡히니 **worktree 경로와 정확히 일치하는 것만** 죽일 것.

**중단된 실행을 재개할 때는 plan에 RESUME 섹션을 추가한다.** 이미 있는 산출물 목록과
"덮어쓰지 말고 테스트로 검증하라 / 파일 존재 ≠ 통과 기준 충족"을 명시하지 않으면
처음부터 다시 만들거나, 반대로 파일만 보고 통과 처리한다.

**Batch/parallel 실행 규칙:**

- 복수 티켓 병렬 요청("all parallel", "run X,Y,Z") → 티켓별 독립 orch 세션 dispatch가 **기본값**.
  단일 main 세션 hand-execution으로 합치려면 **먼저 AskUserQuestion 확인** (조용히 collapse 금지).
- 티켓별 worktree 유지, main은 free로 남아 sibling 티켓 dispatch 계속.

### 판단 로그 — dev-workflow 밖에서도 발동한다

**스킬 호출 여부와 무관하다.** 이 규칙이 `dev-workflow` 스킬 안에만 있던 동안 한 번도 뜨지 않았다 —
스킬은 호출해야 로드되고, 임의 PR 리뷰 세션(`ops:github-pr-review` 등)은 자신이 "게이트"에 있다고
인식하지 않는다. 그래서 트리거·블록을 여기 둔다. 여긴 항상 컨텍스트에 있다.

**트리거는 상태다(이벤트 아님):** orch 태스크가 `done`이고 그 PR이 열려 있음을 **확인한 직후**.
`orch ls`를 직접 친 경우가 여기 포함된다 — orch 완료 알림은 여러 경로 중 하나일 뿐이다.
main/dispatcher 세션에서만 (orch ralph 세션은 헤드리스라 불가). 중복은 PR 번호로 판정 —
`~/.claude/judgment-log.md`에 그 행이 이미 있으면 skip. 상태 트리거라 여러 번 진입해도 안전해야 한다.

main은 워크트리 밖이므로 사실은 직접 모은다 (`gh pr view`,
`git -C <worktree> diff --stat main...HEAD`, PR 본문의 Pre-PR 출력).

```
<ID> — PR #<n> <title>

검증 출력 (사실)
  CI 체크      <gh pr view --json statusCheckRollup 결과. 체크 없으면 "없음">
  테스트       <pass/fail 숫자 + 출처. 출력 없으면 "출력 없음">
  서버 부팅     <BOOT_OK / N/A / 없음>
  신규 env      <목록 or 없음>
  변경 범위     <n files, +a −b>   (계획: <m> files)
  마이그레이션   <파일명 + 되돌릴 수 없는 연산 / 없음>
  롤백 절차     <PR 본문에 있음 / 없음>

판단 (비워둠)
  통과/반려 : ___
  근거      : ___
```

**출처를 반드시 표기한다.** 7줄 중 5줄이 루프가 쓴 텍스트(PR 본문)에서 온다. Pre-PR 체크는
completion-promise지 하드 게이트가 아니므로, 검증 안 된 주장을 사실 칸에 그냥 적으면 이 로그는
루프의 자기보고를 그대로 승인하는 도장이 된다. 구분이 보이게 쓸 것:

```
  테스트       557 passed (PR 본문 주장, CI 미확인)
  테스트       557 passed (CI checks green)
```

`CI 체크`는 `gh`가 GitHub에서 직접 읽는 값이라 루프가 건드릴 수 없다 — 유일하게 독립적인 줄이다.
둘이 어긋나면 그 자체가 가장 중요한 사실이다.

- 사실은 **값**이지 판정이 아니다. 안전함 / 문제없음 / 위험해보임 금지. `DROP COLUMN`과
  `롤백 절차 없음`은 사실로 적고, 그게 결격인지는 jw가 정한다.
- **근거를 제안하거나 대신 채우지 말 것.** 그 빈칸이 유일하게 사람 몫이라 이 로그가 존재한다.
  채워주는 순간 로그가 Claude의 추론이 되고, 그건 이 로그가 막으려던 바로 그것이다.
- jw가 한 줄로 답한다 (`통과 / 롤백 리스크 없음`) → 그 행을 `~/.claude/judgment-log.md`에 append.
- `스킵` → 판단 칸을 빈 채로 append. 빈칸도 데이터다(그날 게이트가 형식이었다는 기록). 재촉 금지,
  나중에 채우지도 말 것.
- 반려 → `★ADR후보` 태그. 주 1회 그중 하나를 정식 ADR로 승격.
- 여러 건 동시 완료 → 압축해 나열하고 한 줄로 전부 받는다
  (`7133 통과 롤백리스크없음 / 7150 반려 드롭컬럼 롤백없음 / 7161 스킵`). 파싱은 Claude 몫.
- 순서: **판단 먼저, 티켓 refine 나중.** diff가 신선할 때 판단하고, refine은 행정이다.

### Jira 티켓 생성 시 프로퍼티

**dev-workflow autonomous pipeline 안:** 질문 없이 **기본값으로 생성**, PR 머지 후 refine.
기본값 — Issue Type `Dev`, Parent `DEV-3637`, Labels `Backend`, Priority `Medium (3)`,
Story Points `3`. *(Parent + Labels는 placeholder — 상황 따라 refine.)*

**dev-workflow 밖에서 단독 티켓 생성 시:** 아래 5개를 **AskUserQuestion으로 확인**.

| 필드         | 선택지                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------- |
| Issue Type   | Dev / Task / Story / Bug / Incident / Epic                                                    |
| Parent       | DEV-3637 / Epic 또는 "없음"                                                                   |
| Labels       | `Backend` / `Frontend` / `개발요청` / `26_2Q` (multiSelect, 최대 4개 선택지 제한) — 상황에 맞게 조합 |
| Priority     | Critical / High / Medium / Low / Lowest                                                       |
| Story Points | 1 / 2 / 3 / 5 / 8 / 13                                                                       |

**자동 설정 (2개):**

| 필드       | 값                                            | Custom Field ID      |
| ---------- | --------------------------------------------- | -------------------- |
| Assignee   | `712020:a7dec654-3a3b-432d-a825-9a38531ddc78` | `assignee.accountId` |
| Start Date | 오늘 날짜                                     | `customfield_10015`  |

**Story Points는 두 필드 모두 설정:** `customfield_10016` + `customfield_10031`

### Notion 태스크 프로퍼티 (`~/prv`)

DB `29241e61-65c0-801f-9529-cabf8cad919b` (프로젝트 진행). Jira 대신 이쪽을 갱신한다.

| 시점 | 채울 컬럼 |
| ---- | --------- |
| 태스크 생성 | `태스크`, `프로젝트`, `상태`=시작 전, `Git 저장소`, `선행 작업` |
| **착수** | `상태`=진행 중, `작업일.start`=오늘, `Git 브랜치` |
| PR 생성 직후 | `PR` |
| 머지 후 | `상태`=완료, `작업일.end`=오늘 |

**컬럼을 비워두지 않는다.** 착수도 안 바꾸고 끝에 몰아서 완료 처리하지 않는다.

⚠️ **`작업일`은 date range다.** 머지 후 `end`를 넣을 때 기존 `start`를 같이 보내지 않으면
시작일이 지워진다. 반드시 현재 값을 조회한 뒤 `{start, end}` 형태로 PATCH할 것.

**Notion `ID`는 prefix가 없다** — `{"prefix": null, "number": 86}`. `#86`으로 표기하고
`DEV-86`으로 쓰지 않는다. `DEV-`는 Jira 티켓 형식이라 로그에서 둘을 구분할 수 없게 된다.

**실제 프로퍼티는 10개뿐이다:** `태스크`(title) · `상태`(select) · `프로젝트`(select) ·
`ID`(unique_id, 읽기 전용) · `작업일`(date range) · `Git 저장소`(url) · `Git 브랜치`(url) ·
`PR`(url) · `선행 작업`(relation) · `후속 작업`(relation). **`생성일`은 존재하지 않는다.**

## docs/plans 파일 규칙

**날짜 포맷:** `MMDD` 사용 (예: `0320`). `YYYY-MM-DD`, `YYMMDD` 사용 금지.

**파일명 컨벤션:** 티켓 ID를 prefix, 날짜 뒤, **type(suffix) 먼저, topic 마지막**.

- 티켓 있을 때: `DEV-XXXX-MMDD-<type>-<short-topic>.md`
- 티켓 없을 때: `MMDD-<type>-<short-topic>.md`

**이유:** VSCode narrow pane (1/3 너비)에서 topic이 truncate되어도 ticket/date/type은 보임. 파일 역할 한눈에 파악 가능.

**Topic 제약:** ≤20자, ≤4단어. 중복어 축약 (verification→verify, rotation→rotate, management→mgmt).

| type           | 용도                 | 생성 시점               |
| -------------- | -------------------- | ----------------------- |
| `input`        | 파싱된 외부 컨텍스트 | parse:jira/notion/slack |
| `design`       | 브레인스토밍 결과    | brainstorming           |
| `plan`         | 구현 계획            | writing-plans           |
| `ticket-info`  | Jira 티켓 정보       | setup-work              |
| `work-info`    | Notion 태스크 정보   | personal-setup-work     |

**예시:**

- `DEV-3384-0316-design-location-storage.md`
- `DEV-3531-0324-input-sensitive-data.md`
- `DEV-4833-0622-input-pw-verify.md`
- `0330-design-plabthon26-ideas.md` (티켓 없음)

**Rename 시점:** setup-work / personal-setup-work에서 티켓 ID가 확정된 후 (신규 생성 또는 기존 티켓 연결 모두 포함), `docs/plans/`의 관련 파일을 `DEV-XXXX-MMDD-<type>-<short-topic>.md`로 rename

**경로 참조:** Jira/Notion에 docs/plans 경로를 기록할 때 절대 경로 사용.

- `<repo-root>/docs/plans/...` (`repo-root` = `$(git rev-parse --show-toplevel)`)
