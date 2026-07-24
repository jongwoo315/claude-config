## Development Workflow

개발 작업 시작 시 `dev-workflow` 스킬을 사용할 것.

**dev-workflow 실행 규칙 (autonomous pipeline):**

- dev-workflow는 **2개 게이트만 동기 확인**한다: Kickoff(plan 승인 go/adjust/cancel) + PR 리뷰(async).
  나머지 단계(parse, ticket, worktree, brainstorm, explore, plan, TDD 구현, verify, commit, PR 생성)는
  무인 자동 진행. Phase A에서 AskUserQuestion 금지.
- Pre-PR 체크(env var, 서버 기동, 전체 테스트)는 게이트가 아니라 ralph-loop completion-promise 조건.
  출력 없이 pass 가정 금지, 조용한 skip 금지.
- 상세 절차는 `dev-workflow` 스킬 참조. 실행은 항상 orch 세션 위임 (loopable=무인 ralph loop,
  driver=사용자 attended). **main 세션 점유 금지** — 두 모드 모두.

**Batch/parallel 실행 규칙:**

- 복수 티켓 병렬 요청("all parallel", "run X,Y,Z") → 티켓별 독립 orch 세션 dispatch가 **기본값**.
  단일 main 세션 hand-execution으로 합치려면 **먼저 AskUserQuestion 확인** (조용히 collapse 금지).
- driver(attended) 실행 승인은 **그 단일 티켓에만** 유효. batch·다른 티켓으로 자동 전이 안 됨.
- **모든 티켓은 orch 세션으로 dispatch. main 세션은 순수 dispatcher (ticket 작업 실행 안 함).**
  kickoff에서 티켓별 실행 모드를 **명시** — 차이는 orch 세션이 headless냐 attended냐뿐:
  - **loopable** (순수 코드+테스트, 외부 env 불필요) → `orch pipe`, daemon이 headless ralph loop로
    advance. 무인.
  - **driver** (라이브 API 키·특수 인터프리터·소스 재빌드·측정 필요 = 헤드리스 loop가 못 닿는 env)
    → `orch add --safe` single-step spawn. daemon이 컨텍스트만 seed하고 hand off → 사용자가
    `tmux attach`로 붙어 직접 구동. **main 세션 self-drive 아님** (구 규칙 폐기). single-step 필수 —
    pipeline이면 daemon advance가 수작업 중 prompt를 injection해서 충돌.
  - 두 모드 모두 kickoff 게이트 + 티켓별 worktree 유지, main은 free로 남아 sibling 티켓 dispatch 계속.

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
