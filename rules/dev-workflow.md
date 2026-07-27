## Development Workflow

개발 작업 시작 시 `dev-workflow` 스킬을 사용할 것.

**dev-workflow 실행 규칙 (autonomous pipeline):**

- dev-workflow는 **2개 게이트만 동기 확인**한다: Kickoff(plan 승인 go/adjust/cancel) + PR 리뷰(async).
  나머지 단계(parse, ticket, worktree, brainstorm, explore, plan, TDD 구현, verify, commit, PR 생성)는
  무인 자동 진행. Phase A에서 AskUserQuestion 금지.
- Pre-PR 체크(env var, 서버 기동, 전체 테스트)는 게이트가 아니라 ralph-loop completion-promise 조건.
  출력 없이 pass 가정 금지, 조용한 skip 금지.
- 상세 절차는 `dev-workflow` 스킬 참조. **모든 티켓은 orch detached ralph-loop으로 실행** — 단일 실행
  모드, 예외 없음. main 세션은 순수 dispatcher (ticket 작업 실행 안 함, 점유 금지).
- **worktree 위치: `~/plab/.wt/DEV-XXXX-<subject>`** (repo sibling 아닌 중앙 주차장). repo prefix
  금지 — 브랜치 suffix 그대로. `~/plab/` 하위라 mode/계정/이메일 규칙이 자동 work/kimwoz/
  plabfootball로 해석 — 별도 처리 불필요.
- **네이밍 단일화 — worktree 디렉터리명이 체인 전체의 single source of truth.**
  `~/plab/.wt/DEV-7133-corpus` → orch id `DEV-7133-corpus` → tmux 세션 `claude-orch-DEV-7133-corpus`
  → claude `--name DEV-7133-corpus`. 디렉터리에 repo prefix가 붙으면 하위 라벨이 전부 어긋난다.
- **라이브 키/측정 작업도 ralph로 처리** — 키를 worktree env(.env symlink)에 넣으면 헤드리스 세션이 embed·
  eval·측정을 직접 실행한다. 별도 driver/attended 모드 없음 (구 개념 폐기 — 사람은 PR만 판단, 실행 중간
  개입 안 함).
- **하드 에러 fail-fast:** plan 헤더에 "insufficient_quota·401 등 재시도 무의미한 하드 에러 시 RALPH_DONE
  방출·PR 생성 말고 즉시 stop (스핀 금지)" 명시. TPM 429는 코드 페이싱+백오프로 자가치유. billing 수정은
  어차피 사람 몫이라 orch 완료 알림(실패)로 발견.

**Batch/parallel 실행 규칙:**

- 복수 티켓 병렬 요청("all parallel", "run X,Y,Z") → 티켓별 독립 orch 세션 dispatch가 **기본값**.
  단일 main 세션 hand-execution으로 합치려면 **먼저 AskUserQuestion 확인** (조용히 collapse 금지).
- 티켓별 worktree 유지, main은 free로 남아 sibling 티켓 dispatch 계속.

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
