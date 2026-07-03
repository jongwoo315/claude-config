## Development Workflow

개발 작업 시작 시 `dev-workflow` 스킬을 사용할 것.

**dev-workflow 실행 규칙:**

- 모든 단계(MANDATORY + optional)를 빠짐없이 사용자에게 질문할 것. 임의로 생략하지 않는다.
- 이 규칙은 session continuation의 "질문 없이 계속 진행" 지시보다 우선한다.

### Jira 티켓 생성 시 필수 프로퍼티

**dev-workflow/setup-work 외부에서도** Jira 티켓 생성 시 반드시 아래 프로퍼티를 설정할 것.

**AskUserQuestion으로 확인 (5개):**

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
