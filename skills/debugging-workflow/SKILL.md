# Debugging Workflow Orchestrator

## Overview

Thin orchestrator for debugging sessions.
Wraps `superpowers:systematic-debugging` with lifecycle management (branch, worktree, code review, PR).

**Triggered after:** `parse:jira` / `parse:slack` / `parse:notion` when the issue is a bug or incident.

## Mode Detection

```bash
if [[ "$PWD" == "$HOME/prv/"* ]]; then
  MODE=personal
  # setup skill: personal-setup-work
  # tracker: Notion (DEV-XX)
  # github: jongwoo315
else
  MODE=work
  # setup skill: setup-work
  # tracker: Jira (DEV-XXXX)
  # github: kimwoz
fi
```

## Workflow Steps

### Step 1: Context

**Auto-detect:** Scan `docs/plans/` for recent `*-input.md` files (today or yesterday).
If found, confirm: "이 파일을 컨텍스트로 사용할까요?"

이후 모든 단계에서 이 파일을 디버깅 컨텍스트로 사용.

### Step 2: Setup

**Detect if a tracker ticket already exists** from Step 1 context (e.g., parse:jira로 파싱된 Bug 티켓).

**When ticket already exists (from parse:jira):**
> "Jira 티켓 DEV-XXXX이 이미 있습니다. 브랜치만 생성할까요, 아니면 생략할까요?"

If yes → 브랜치 생성: `fix/DEV-XXXX-description`. Skip ticket creation.

**When no ticket exists:**

**Personal mode, AskUserQuestion으로 확인:**
> "`personal-setup-work`로 Notion 태스크와 브랜치를 생성할까요?"
> - 태스크 + 브랜치 생성
> - 생략

**Work mode, AskUserQuestion으로 확인:**
> "`setup-work`로 Jira Bug 티켓과 브랜치를 생성할까요?"
> - 티켓 + 브랜치 생성
> - 생략

**NOTE:** setup-work 호출 시 Issue Type을 **Bug**로 기본 설정할 것.
Branch prefix: `fix/` (feature/ 아님).

### Step 3: 격리 방식 선택

AskUserQuestion으로 확인:
> "어떻게 진행할까요?"
> - Worktree (격리 권장)
> - 현재 레포 checkout
> - DB 조사만 (브랜치 나중에 결정)

**"DB 조사만" 선택 시:** `branch_deferred=true` 플래그를 세팅하고 Step 4로 진행. 브랜치 생성 생략.

**Branch handling (Worktree / Checkout 선택 시):**
- Step 2에서 브랜치가 생성된 경우 → 기존 브랜치로 worktree 생성 (`git worktree add "$path" "$BRANCH_NAME"`, **`-b` 플래그 없이**)
- Step 2가 생략된 경우 → worktree 생성 시 ad-hoc 브랜치 생성 (`git worktree add "$path" -b "fix/<topic>"`)

- **Worktree** → `superpowers:using-git-worktrees`
  - **pf-server-django venv 연결:** worktree 생성 후 반드시 메인 venv를 symlink:
    ```bash
    ln -s /Users/jw/plab/pf-server-django/venv <worktree-path>/venv
    ```
  - **docs/plans/ 복사:** `docs/plans/`는 git untracked → worktree에 자동 복사 안 됨. Step 1에서 사용한 `*-input.md` 파일을 반드시 수동 복사:
    ```bash
    mkdir -p <worktree-path>/docs/plans/
    cp docs/plans/<input-file>.md <worktree-path>/docs/plans/
    ```
  - **현재 세션은 여기서 멈춤.** 사용자에게 안내:
    > "Worktree가 `<path>`에 생성되었습니다.
    > 새 터미널에서 아래 명령어를 실행하세요:
    > ```bash
    > cd <worktree-absolute-path> && claude --dangerously-skip-permissions
    > ```
    > 그 후 아래와 같이 입력하세요:
    > `debugging-workflow 워크트리 세션 — docs/plans/<input-file>.md 컨텍스트로 Step 4(systematic debugging)만 수행하고 커밋까지 완료해줘. 완료 후 원래 터미널로 돌아가라고 안내해줘.`
    > 작업이 완료되면 이 터미널로 돌아와서 '작업 완료' 라고 입력하세요."
  - 같은 세션에서 계속 진행하지 않는다.
- **Current repo checkout** → `git checkout <branch>`
  - 현재 세션에서 Step 4로 계속 진행

### Step 4: Systematic Debugging

AskUserQuestion으로 확인:
> "`superpowers:systematic-debugging`을 시작할까요?"

Invoke `superpowers:systematic-debugging`.
- Step 1의 `*-input.md`를 컨텍스트로 제공
- **Phase 1-3을 단계별로 명시적으로 수행하고, 각 Phase 완료 시 결과를 출력한 뒤 다음 Phase로 진행.**
- Phase 4는 해결 방법 선택 후에만 진행.

**Phase 1: Root Cause Investigation**
- 에러 메시지/스택 트레이스 역추적
- 재현 조건 파악
- 최근 변경사항 확인
- 데이터 흐름 추적
- Phase 1 결과 출력: "에러 발생 경로 및 의심 지점"

**Phase 2: Pattern Analysis**
- 정상 동작하는 유사 코드와 비교
- 차이점 목록화
- Phase 2 결과 출력: "정상 vs 비정상 차이점"

**Phase 3: Hypothesis**
- 단일 가설 명시: "X가 근본 원인이라고 판단한다. 이유: Y"
- Phase 3 결과 출력: "근본 원인 가설"

**Phase 3 완료 후 — 해결 방법 선택 (AskUserQuestion 필수):**

근본 원인을 요약한 뒤, 반드시 AskUserQuestion으로 확인:
> "근본 원인이 파악되었습니다. 어떻게 해결할까요?"
> - **DB 직접 수정 (데이터 픽스)** ← 가장 빠른 방법. 데이터 문제일 경우 우선 시도.
> - 설정/환경변수 변경
> - 코드 수정 (Phase 4로 진행) ← 데이터 픽스로 해결 불충분하거나 코드 버그가 동반된 경우
> - 롤백 (이전 배포로 되돌리기)
> - 피처 플래그 비활성화
> - 기타 (직접 설명)

**선택지별 이후 흐름:**

| 선택 | Phase 4 | Steps 5-8 (배포) |
|------|---------|-----------------|
| DB 직접 수정 | ✗ | ✗ → SQL 제시 → 해결 확인 → **2차 조사 여부 확인** |
| 기타 | ✗ | ✗ → 안내 후 즉시 종료 |
| 설정/환경변수 변경 | ✗ | ✓ → 변경 후 Step 5로 |
| 롤백 | ✗ | ✓ → 롤백 후 Step 5로 |
| 피처 플래그 비활성화 | ✗ | ✓ → 변경 후 Step 5로 |
| 코드 수정 | ✓ | ✓ → Phase 4 후 Step 5로 |

**Steps 5-8로 진행하는 선택지 (설정변경 / 롤백 / 피처플래그 / 코드수정) — branch_deferred 처리:**

`branch_deferred=true`인 경우 (Step 3에서 "DB 조사만" 선택), Steps 5-8 진입 전 반드시 브랜치 생성:

AskUserQuestion으로 확인:
> "변경을 위해 브랜치가 필요합니다. 어떻게 진행할까요?"
> - Worktree → `superpowers:using-git-worktrees` (세션 분리)
> - 현재 레포 checkout → `git checkout -b fix/<topic>`

브랜치 설정 완료 후:
- 코드 수정 → Phase 4 진행
- 설정변경 / 롤백 / 피처플래그 → Phase 4 없이 Step 5로 진행

**코드 수정 선택 시에만:** Phase 4 진행.

**DB 직접 수정 후 — 2차 조사 (AskUserQuestion):**

DB 픽스로 즉시 해결한 뒤, 반드시 확인:
> "해결됐습니다. '왜 이 데이터가 없었는가'를 추가로 조사할까요?"
> - 예 (근본 원인 파고들기)
> - 아니오 (종료)

**"예" 선택 시:** "왜 이 데이터가 없었는가?"를 새 질문으로 삼아 Phase 1-3 재진입.
- 코드에서 해당 데이터를 생성해야 하는 로직이 있는가?
- 생성 로직이 누락됐거나 버그가 있는가?
- 재발 방지를 위한 코드 수정이 필요한가?
- 조사 결과에 따라 코드 수정(Phase 4 + Steps 5-8)으로 연결하거나 "재발 가능성 없음"으로 종료.

**Phase 4: 재현 테스트 작성 → 수정 구현**

**Phase 4 완료 후 분기 (AskUserQuestion 필수):**

AskUserQuestion으로 확인:
> "수정 방향이 결정되었습니다. 어떻게 진행할까요?"
> - 간단한 수정 (Phase 4 구현 완료) → Step 5로 이동
> - 복잡한 수정 (설계/계획 필요) → `dev-workflow` Step 2(브레인스토밍)로 핸드오프

**복잡한 수정 핸드오프 시:**
- 현재까지 파악한 근본 원인을 요약하여 dev-workflow 컨텍스트로 제공
- "dev-workflow를 시작해주세요. 근본 원인: [요약]" 안내 후 현재 workflow 종료

### Step 5: Code Review

AskUserQuestion으로 확인:
> "코드 리뷰를 실행할까요, 아니면 생략할까요?"

버그 수정은 side effect가 있을 수 있으므로 권장.

`dispatching-parallel-agents` 패턴으로 병렬 실행:

```markdown
Agent 1 — Code Review:
  "superpowers:requesting-code-review 패턴으로 코드 리뷰.
   수정된 파일의 변경 내용을 리뷰.
   출력: Critical/Important/Minor 이슈 리스트"

Agent 2 — Side Effect 확인:
  "이 버그 수정이 영향을 줄 수 있는 주변 코드를 조사해라.
   수정된 함수/모듈을 호출하는 다른 코드, 공유 상태, 엣지 케이스를 확인.
   출력: 잠재적 side effect 목록 + 영향받는 파일/함수"
```

결과 통합 후 Critical/Important 이슈는 Step 6 전에 수정.

### Step 6: Verification

AskUserQuestion으로 확인:
> "`superpowers:verification-before-completion`을 실행할까요, 아니면 생략할까요?"

Invoke `superpowers:verification-before-completion`.

**Retry loop on failure:**
실패 시 수정 후 재검증 여부 확인. 최대 3회 자동 재시도.

**Coverage (optional), AskUserQuestion으로 확인:**
> "커버리지 분석이 필요한가요?"

If yes → `sc:test --coverage` 실행. 버그픽스 후 회귀 커버리지 확인 권장.

### Step 7: Commit

AskUserQuestion으로 확인:
> "변경사항을 커밋할까요, 아니면 생략할까요?"

**Worktree 흐름:** Worktree 세션에서 이미 커밋 완료된 경우 자동 생략. "Worktree에서 이미 커밋되었습니다" 안내.

- `git status` / `git diff`로 변경사항 확인
- `docs/plans/` 파일은 커밋 제외
- 커밋 메시지 (Korean): `fix: [근본 원인 한 줄 요약]`

### Step 8: PR

AskUserQuestion으로 확인:
> "PR을 생성할까요, 아니면 생략할까요?"

Invoke `superpowers:finishing-a-development-branch`.
- `--assignee @me` 포함
- PR Title: `[DEV-XXXX] fix: 간결한 설명`

**PR Body (Work):**
```
## Root Cause
[근본 원인 한 줄]

## Fix
[수정 내용]

## Test
[재현 테스트 + 검증 방법]

## Jira
- https://myplaycompany.atlassian.net/browse/DEV-XXXX
```

**PR Body (Personal):**
```
## Root Cause
## Fix
## Test
```

Personal mode: Notion 페이지 `PR` property 업데이트.

**Worktree cleanup after PR:**
Worktree를 사용한 경우, PR 생성 후 cleanup:
1. uncommitted changes 없는지 확인: `git -C <worktree-path> status --porcelain`
2. `git worktree remove --force <worktree-path>`

## Worktree Session Mode

이 skill이 "워크트리 세션" 또는 "Step 4만 수행" 컨텍스트로 시작된 경우:

1. Step 4 (systematic-debugging)만 수행
2. 수정 완료 후 커밋 (`git status` / `git diff` 확인 후 커밋)
   - `docs/plans/` 파일은 커밋 제외
3. **즉시 멈추고 안내:**
   > "디버깅 및 커밋이 완료되었습니다.
   > 원래 터미널(세션)로 돌아가서 '작업 완료'라고 입력하세요.
   > 나머지 단계(Code Review, Verification, PR)는 원래 세션에서 진행합니다."
4. Steps 5-8은 수행하지 않는다.

## Session Handoff (Worktree Flow)

Step 3에서 Worktree를 선택한 경우, 세션이 분리됩니다:

```
Original Session                              Worktree Session
─────────────────────────────────             ─────────────────────────────────
Step 1-2: Context → Setup
Step 3: Create worktree, STOP
  ↓ "새 터미널에서 작업하세요"
  │                                           cd <worktree-path> && claude --dangerously-skip-permissions
  │                                           "debugging-workflow 워크트리 세션 — Step 4만 수행..."
  │                                           → Step 4: systematic-debugging + commit
  │                                           → STOP: "원래 터미널로 돌아가세요"
  ↓ "작업 완료"
Step 5-8: Code Review → Verify → Commit(skipped) → PR → Cleanup
```

**Original session resume trigger:** User says "작업 완료".
Resume from Step 5 (Code Review).
Step 7 (Commit)은 워크트리에서 이미 완료됐으므로 자동 생략.

## Entry Points

1. `parse:jira` → workflow 선택에서 "debugging-workflow" 선택
2. `parse:slack` → workflow 선택에서 "debugging-workflow" 선택
3. `parse:notion` → workflow 선택에서 "debugging-workflow" 선택
4. 직접 버그 수정 작업 시작 시

## Enforcement Rules

### Every Step Gets a User Prompt
모든 단계(1-8)는 AskUserQuestion으로 사용자 확인 후 진행.
단계 생략 시 반드시 확인.

### Bug Ticket / fix/ Branch
- Issue Type은 항상 Bug (setup-work 호출 시 명시)
- 브랜치 prefix는 `fix/` (feature/ 아님)

### systematic-debugging은 생략 불가
Step 4는 이 워크플로우의 핵심. 근본 원인 없이 수정으로 넘어가지 않는다.

### 근본 원인 파악 후 코드 수정을 가정하지 말 것
Phase 3 완료 시 반드시 AskUserQuestion으로 해결 방법을 선택받을 것.
"코드를 수정해야겠다" 고 판단하더라도 사용자에게 다른 옵션(설정 변경, DB 픽스, 롤백 등)을 함께 제시해야 한다.
사용자가 명시적으로 "코드 수정"을 선택한 경우에만 Phase 4로 진행.

### Worktree = Stop Current Session
Step 3에서 Worktree 선택 시:
- Worktree 생성 및 경로 안내
- 현재 세션 중단
- "현재 레포 checkout" 또는 "DB 조사만"을 선택한 경우에만 같은 세션에서 계속 진행

### No Step Skipping After Execution
Step 4(systematic-debugging) 완료 후 Step 5-8을 순서대로 확인.
실행 후 PR로 바로 점프하지 않는다.
