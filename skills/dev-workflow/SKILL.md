---
name: dev-workflow
description: Use when starting any development task — after parsing external input (Slack, Notion, Jira) or when user requests a feature, bugfix, or refactoring. Orchestrates the full workflow from brainstorming through PR creation. Triggers on development requests, parsed inputs, or explicit workflow invocation.
---

# Development Workflow Orchestrator

## Overview

Single orchestrator for all development workflows — personal and work projects.
Detects project mode from working directory, branches only at setup and finishing steps.
Supports multiple context sources (Jira, Notion, Slack) that can feed in at start or mid-workflow.

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

## Step Sequence (필수 추적)

아래 순서를 반드시 따른다. 각 Step 완료 후 다음 Step 번호를 명시적으로 announce한다.
외부 스킬이 다른 스킬을 invoke하라고 지시해도 이 순서를 따른다.

```
Step 0: Triage (작업 tier 분류 → 깊이 라우팅)   ← calibration gate, 나머지 step 깊이 결정
Step 1: Context Gathering
Step 2: Brainstorming
Step 3: Setup (Jira/Notion 티켓 + 브랜치)    ← 자주 건너뛰어지는 단계
Step 4: Codebase Exploration                  ← 자주 건너뛰어지는 단계
Step 5: Writing Plans
Step 6: Execution Method
Step 7: Worktree/Checkout & Execution
Step 8: Review & Verification
Step 9: Commit
Step 10: PR Creation
```

**Step 완료 시 announce 형식:** "**Step N 완료. 다음: Step N+1 ([step name])**"

---

## Workflow Steps

### Step 0: Triage (Calibration Gate)

**목적:** 모든 작업에 같은 깊이를 쓰는 것을 방지. "기술부채"보다 "이해부채"가 커지는 시대 — 되돌리기 힘든 곳에만 이해를 투자하고, 흘려보낼 곳은 흘려보낸다. 200개 티켓 자동리뷰(전부 깊이 0)와 전부 단계별 확인(전부 같은 깊이) 둘 다 calibration 부재. 이 게이트가 그것을 고친다.

**작업을 아래 tier로 분류한다. 애매하면 더 높은 tier로 올린다 (안전 우선).**

| Tier | 신호 | 깊이 라우팅 |
| --- | --- | --- |
| **A — 흘려보냄** | boilerplate, CRUD, config, 문서, 카피 변경, 되돌리기 쉬움, 테스트로 완전 커버 | Step 2/4/5 자동 생략 제안. Step 6은 Batch/Subagent 기본. Step 8은 클로드 리뷰 도장 OK. 확인 최소화. |
| **B — 선택적 깊이** | 새 로직, 여러 파일 걸침, 기존 패턴 변형 | 설계 지점(Step 2 brainstorming, Step 5 plan)만 확인. 실행/리뷰는 흐름. |
| **C — 라인 단위 이해** | 도메인 핵심 로직, 데이터 모델/스키마, 마이그레이션, 보안/인증, 동시성/락, 결제, 되돌리기 힘든 것 | 전 step 확인 (현재 기본 동작). Step 8a에 **anti-ritual 장치** 강제 (아래). |

**AskUserQuestion으로 확인 (Step 0):**
> "이 작업의 tier를 판단했습니다: **Tier [X] — [근거 한 줄]**. 이대로 진행할까요?"
> - 확인 — 이 tier 깊이로 진행
> - Tier 올리기 — 한 단계 더 신중하게
> - Tier 내리기 — 한 단계 더 빠르게

**분류 근거를 반드시 한 줄로 명시** (예: "auth_user 스키마 변경 + 마이그레이션 → 되돌리기 힘듦 → Tier C"). 근거 없는 tier 배정 금지.

**인프라/DB/보안 작업은 Tier C 하한.** 절대 A/B로 내리지 말 것. `infra-workflow`/`infra-safety-gate`가 별도로 강제하지만 여기서도 방어.

선택된 tier를 이후 모든 Step의 확인 강도 기준으로 사용한다. plan 파일 헤더에 `**Tier:** [X]` 기록.

**Step 완료 시 announce:** "**Step 0 완료 (Tier [X]). 다음: Step 1 (Context Gathering)**"

### Step 1: Context Gathering

Before brainstorming, detect and collect all available context.

**Auto-detect:** Scan `docs/plans/` for recent `*-input.md` files (today or yesterday).
If found, list them and confirm: "이 파일들을 컨텍스트로 사용할까요?"

**AskUserQuestion으로 확인:**

> "추가 컨텍스트 소스가 있나요?"
> - Jira 티켓 URL → `parse:jira` 실행
> - Notion 페이지 URL → `parse:notion` 실행
> - Slack 스레드 URL → `parse:slack` 실행
> - 없음 (직접 설명하겠습니다)

Multiple sources can be combined. Each parser outputs to `docs/plans/*-input.md`.
All gathered context feeds into subsequent steps (brainstorming, planning, etc.).

**When Jira ticket already exists:**
If a Jira input file is detected or provided, extract the ticket key (e.g., DEV-3131).
This ticket will be reused in Step 3 (Setup) — no need to create a new one.

### Step 2: Brainstorming

**AskUserQuestion으로 확인:**
> "`superpowers:brainstorming`으로 브레인스토밍을 실행할까요, 아니면 생략할까요?"

Invoke `superpowers:brainstorming`.
- If started from parse:slack/notion/jira, use the parsed input as context
- If started from `superpowers:systematic-debugging`, root cause analysis feeds into solution design
- Output: `docs/plans/YYMMDD-<topic>-design.md`

**⛔ HARD GATE — brainstorming 복귀:**
brainstorming 스킬은 완료 시 자체적으로 "→ invoke writing-plans"를 지시한다.
**dev-workflow 안에서는 이 지시를 무시하라.** writing-plans는 Step 5에서 실행한다.
brainstorming 완료 후 반드시 **Step 3 (Setup)**으로 돌아와야 한다.
건너뛰더라도 Step 3의 AskUserQuestion을 먼저 제시한 후 사용자가 "생략"을 선택해야 한다.

**Spec Review (optional, within brainstorming):**
After brainstorming completes, **AskUserQuestion으로 확인:**
> "`sc:spec-panel`로 브레인스토밍 결과를 전문가 패널 리뷰할까요?"

Recommended for: complex features, API design, multi-service changes.
Feeds review feedback back into the design doc before proceeding.

### Step 3: Setup

> Ask user about ticket/branch creation (see below).

**Detect if a tracker ticket already exists** from Step 1 context (parsed Jira input, user-provided URL, etc.).

**When ticket already exists (from Step 1), AskUserQuestion으로 확인:**
> "Jira 티켓 DEV-XXXX이 이미 있습니다. 브랜치만 생성할까요, 아니면 생략할까요?"

If yes, create branch using the existing ticket key (e.g., `feature/DEV-XXXX-description`). Skip ticket creation.

**When no ticket exists:**

**Personal mode, AskUserQuestion으로 확인:**
> "`personal-setup-work`로 Notion 태스크와 브랜치를 생성할까요?"
> - 태스크 + 브랜치 생성 (바로 작업 시작)
> - 태스크만 생성 (나중에 작업)
> - 생략

**Work mode, AskUserQuestion으로 확인:**
> "`setup-work`로 Jira 티켓과 브랜치를 생성할까요?"
> - 티켓 + 브랜치 생성 (바로 작업 시작)
> - 티켓만 생성 (나중에 작업)
> - 생략

Invoke the mode-appropriate skill. Branch is created but NOT checked out.

**IMPORTANT — "Ticket Only" 경로에서도 상세 필드 필수:**
사용자가 "티켓만 생성" 또는 "just create a jira ticket"을 선택해도, setup-work의 6개 필수 확인 항목(Project, Issue Type, Parent, Labels, Priority, Story Points)을 **모두** AskUserQuestion으로 질문해야 합니다. 상세 필드 없이 티켓을 생성하면 안 됨.

**"Ticket Only" 선택 시 워크플로우:**
1. setup-work 스킬을 "Ticket Only" 모드로 호출
2. 6개 필수 필드 모두 확인
3. 티켓 생성 후 현재 세션 종료 안내
4. 재개 시 티켓 URL로 Step 3부터 이어서 진행 가능

### Step 4: Codebase Exploration (dispatching-parallel-agents pattern)

**AskUserQuestion으로 확인:**
> "코드베이스 탐색이 필요할까요, 아니면 생략할까요?"

When recommended: unfamiliar code, multi-module changes, need to understand existing patterns.

If yes, apply the `dispatching-parallel-agents` pattern:

**1. Identify independent exploration domains** from the brainstorming output (Step 2).
Group by what needs to be understood — each domain should be investigable without context from others.

**2. Create focused Agent prompts.** Each Agent gets:
- **Specific scope:** One module, layer, or concern (NOT "explore everything")
- **Clear goal:** What question to answer
- **Constraints:** Where to look (directory/file boundaries)
- **Output format:** Structured summary the main agent can integrate

**3. Dispatch in parallel** using `Task(subagent_type=Explore)`:

```markdown
# Example: "민감정보 마스킹 시스템 구현" 탐색

Agent 1 — 기존 마스킹/필터링 패턴:
  "프로젝트에서 데이터 마스킹, 필터링, 또는 민감정보 처리를 하는 기존 코드를 찾아라.
   검색 범위: middleware/, serializers/, utils/
   찾을 것: 마스킹 함수, 정규식 패턴, 설정 방식
   출력: 파일 경로 + 함수명 + 어떤 데이터를 어떻게 처리하는지 요약"

Agent 2 — 로깅/감사 아키텍처:
  "프로젝트의 로깅 설정과 감사 로그 구현을 추적해라.
   검색 범위: settings/, logging/, signals/
   찾을 것: 로그 포맷터, 핸들러, audit trail 구현
   출력: 로깅 파이프라인 흐름 (어디서 → 어떤 포맷으로 → 어디에 저장)"

Agent 3 — 권한/역할 체계:
  "사용자 역할과 권한 체계가 어떻게 구현되어 있는지 파악해라.
   검색 범위: permissions/, auth/, decorators/
   찾을 것: 역할 enum/모델, 권한 체크 방식, 역할별 분기 패턴
   출력: 역할 목록 + 권한 체크가 적용되는 지점 목록"
```

**4. Review and share results** with user before proceeding.
- Read each Agent's summary
- Check for overlapping findings or contradictions
- Present integrated exploration results to user
- Identify gaps that need follow-up investigation

**5. Phase 2 dispatch (when Phase 1 reveals cross-domain gaps):**

After integrating Phase 1, dispatch a follow-up agent if any of these apply:
- Phase 1 results contradict each other
- Agent A's finding changes the scope of what Agent B should have searched
- A shared component was found that affects multiple domains

```markdown
Agent N — Cross-domain 보완:
  "Phase 1 탐색 결과:
   - Agent 1: [key finding]
   - Agent 2: [key finding]
   이를 바탕으로 [specific gap]을 조사해라.
   검색 범위: [narrowed scope from Phase 1]
   출력: [specific format]"
```

Phase 2가 필요 없으면 생략. 단순 변경이나 Phase 1 결과가 일관적이면 skip.

**이벤트/함수 설계 시 추가 Agent (발생 지점 전수 탐색):**

새 trigger_type, 이벤트명, 또는 공유 식별자를 설계할 때 dispatch:

```markdown
Agent N — 발생 지점 전수 탐색:
  "<대상 함수명 또는 이벤트명>이 호출/발생하는 모든 지점을 찾아라.
   검색 범위: [관련 디렉토리]
   찾을 것: 호출 위치(파일+함수), 각 호출이 사용자 액션인지 시스템 자동 발생인지
   출력: 발생 지점 목록 + 컨텍스트 요약"
```

→ 결과를 바탕으로 이름 확정 (이름이 실제 동작 범위를 정확히 표현하는지 검증)

**Common mistakes to avoid:**
- "코드베이스 전체 구조를 파악해라" → too broad, Agent gets lost
- Context from brainstorming not included → Agent searches blindly
- No output format specified → Agent returns unstructured wall of text

### Step 5: Writing Plans

**AskUserQuestion으로 확인:**
> "`superpowers:writing-plans`로 구현 계획을 작성할까요, 아니면 생략할까요?"

If yes, invoke `superpowers:writing-plans`.

**Filename format override:** Plan filename MUST use `YYMMDD-` prefix (e.g., `260316-feature-name.md`), NOT `YYYY-MM-DD-`. Pass this to writing-plans as the filename convention. Example: `docs/plans/260316-phone-change-validation-fix.md`.

Plan header metadata:
- Personal: `**Notion:** DEV-XX`
- Work: `**Jira:** DEV-XXXX`
- 티켓 미생성 시 (Step 3 생략): 메타데이터 생략

Optional: present 2-3 competing approaches if architectural decision needed.

### Step 6: Execution Method

**Use AskUserQuestion with these EXACT values (do NOT paraphrase or add task-specific details):**

```
question: "실행 방법을 선택하세요 (Step 6)"
header: "Execution"
options:
  1. label: "Subagent 구현"
     description: "서브에이전트가 Task별 자율 TDD + spec/code review"
  2. label: "직접 구현 (Guided TDD)"
     description: "매 기능마다 사용자 참여 여부를 묻고 대화형으로 진행"
  3. label: "배치 실행 (Batch + Checkpoint)"
     description: "3개 Task씩 실행 후 리뷰 체크포인트, 피드백 반영 후 다음 배치"
```

**After user selects:** Update the plan file header with the chosen execution method.
**Worktree override:** If Step 7 selects Worktree, append the worktree completion directive (shown below) to the header.
If Step 7 selects "현재 레포 checkout", do NOT append it (let the execution skill call `finishing-a-development-branch` normally).

**Option A header:**
```markdown
> **For Claude:** Use superpowers:subagent-driven-development to implement this plan.
> **Constraint:** Only modify files explicitly listed in each Task. Do not refactor, clean up, or improve adjacent code outside the task scope.
```

**Option B header (includes full interactive protocol):**
```markdown
> **For Claude:** Use superpowers:test-driven-development (Guided TDD) to implement this plan.
> Follow the interactive ping-pong protocol below for EACH feature/task in this plan.
>
> **For each feature/behavior:**
>
> **Gate.** Before starting each iteration, ask:
> "다음 기능: [feature name]. TDD 사이클에 참여할까요?"
> - 참여 — 시나리오 선택 + 테스트 작성에 참여합니다
> - 패스 — AI가 테스트와 구현을 모두 처리합니다 (결과만 리뷰)
>
> **If 패스:** Run the full TDD cycle autonomously (test → RED → implement → GREEN → refactor),
> then present a summary. User reviews before moving on.
>
> **If 참여:**
> 1. Propose 2-3 test scenarios with tradeoffs. Ask: "어떤 동작을 먼저 테스트할까요?"
> 2. User selects scenario + defines key parameters
> 3. Create test scaffolding (imports, fixtures, function signature + TODO marker)
> 4. Ask: "이 테스트 로직을 직접 작성할까요?" (직접 작성 / AI에게 맡기기)
> 5. Run test → RED 확인
> 6. Write minimal implementation to pass
> 7. Run test → GREEN 확인
> 8. Refactor if needed (keep tests green)
> → Repeat from Gate for the next feature.
```

**Option C header:**
```markdown
> **For Claude:** Use superpowers:executing-plans to implement this plan.
```

The plan header embeds the execution method so a fresh worktree session can follow it without needing the dev-workflow skill.

### Step 7: Worktree/Checkout & Execution

**AskUserQuestion으로 확인:**
> "Worktree로 격리할까요, 아니면 현재 레포에서 checkout할까요?"

**Branch handling:**
- Step 3에서 브랜치가 생성된 경우 → 기존 브랜치로 worktree 생성 (`git worktree add "$path" "$BRANCH_NAME"`, **`-b` 플래그 없이**)
- Step 3이 생략된 경우 → worktree 생성 시 ad-hoc 브랜치 생성 (`git worktree add "$path" -b "feature/<topic>"`)

- **Worktree** → `superpowers:using-git-worktrees`
  - **⚠️ `using-git-worktrees`의 "Verify Clean Baseline" (테스트 실행) 단계는 생략.** worktree 생성 + venv symlink + plan 복사 완료 즉시 사용자 안내 후 멈출 것. 테스트 실패 시에도 계속 진행하거나 조사하지 말 것.
  - **Append worktree completion directive to plan header** before copying:
    ```markdown
    > **IMPORTANT (Worktree context):** After all tasks complete, do NOT invoke superpowers:finishing-a-development-branch.
    > Instead, commit all changes and tell the user: "구현이 완료되었습니다. 원래 터미널(세션)로 돌아가서 '작업 완료'라고 입력하세요.
    > 나머지 단계(Review, Commit, PR 생성)는 원래 세션에서 진행합니다."
    ```
    **주의:** worktree completion directive는 execution method directive(`> **For Claude:** Use superpowers:X ...`) 아래에 추가. execution method directive를 덮어쓰지 않도록 할 것.
  - Copy plan file to worktree (execution method + worktree directive now in header)
  - **venv / .env 연결:** worktree 생성 후 메인 레포의 `venv`와 `.env`(존재 시)를 symlink
    ```bash
    REPO_ROOT=$(git rev-parse --show-toplevel)
    ln -s "$REPO_ROOT/venv" <worktree-path>/venv
    [ -f "$REPO_ROOT/.env" ] && ln -s "$REPO_ROOT/.env" <worktree-path>/.env
    ```
  - **구현 세션 실행 방식 — AskUserQuestion으로 확인:**
    > "구현 세션을 어떻게 실행할까요?"
    > - 수동 새 세션 — 직접 새 터미널을 열어 실행 (대화형 관찰/개입 가능)
    > - orch 무인 위임 — orch가 세션을 자동 스폰해 무인 실행 (원래 세션 유지, 다른 작업 병행 가능)

    두 방식 모두 worktree 격리 + `--dangerously-skip-permissions` 동일. 차이는 세션을 사람이 여느냐 orch가 자동으로 여느냐뿐. orch 위임은 plan이 촘촘해 구현이 기계적일 때 적합 (탐색적 구현이면 수동 새 세션 권장).

    **`<chosen-skill>` 치환 규칙 (두 방식 공통):** Step 6에서 선택한 실행 방법에 따라:
    - Option A → `superpowers:subagent-driven-development`
    - Option B → `superpowers:test-driven-development`
    - Option C → `superpowers:executing-plans`
    반드시 실제 스킬명으로 치환할 것. 제네릭 프롬프트("계획을 실행해줘") 금지.

    **방식 1 — 수동 새 세션:** **현재 세션은 여기서 멈춤.** 사용자에게 안내 (반드시 `cd` 명령 + 실행 스킬명 포함):
    > "Worktree가 `<path>`에 생성되었습니다.
    > 새 터미널에서 아래 명령어를 실행하세요:
    > ```bash
    > cd <worktree-absolute-path> && claude --dangerously-skip-permissions
    > ```
    > 그 후 `superpowers:<chosen-skill>로 docs/plans/<plan-file>.md 계획을 실행해줘` 라고 입력하세요.
    > 작업이 완료되면 이 터미널로 돌아와서 '작업 완료' 라고 입력하세요."
    - **중요:** 안내 시 `<worktree-absolute-path>`를 실제 절대 경로로 치환할 것. 사용자가 `cd` 없이 claude를 실행하면 메인 레포에서 작업하게 됨.

    **방식 2 — orch 무인 위임:** dev-workflow가 이미 아는 worktree 경로 + plan 경로 + chosen-skill로 명령을 **자동 조립**해 실행 (사용자 붙여넣기 없음):
    ```bash
    orch add <worktree-absolute-path> "superpowers:<chosen-skill>로 docs/plans/<plan-file>.md 계획을 실행하고, 완료되면 모두 커밋해줘. no questions."
    orch start --max 1   # 데몬 미기동 시에만
    ```
    - `<worktree-absolute-path>` / `<plan-file>` / `<chosen-skill>` 모두 실제 값으로 치환 (제네릭 금지).
    - 실행 후 사용자에게 안내:
      > "orch에 위임했습니다 (worktree `<path>`). 진행 상태는 `orch ls`로 확인하세요.
      > `done`이 되면 이 세션에 '작업 완료'라고 입력하세요. 나머지 단계(Review, Commit, PR)는 여기서 진행합니다."
    - **현재 세션은 여기서 멈춤** (수동 방식과 동일). orch 세션과 대화하지 않음 — 산출물은 worktree 커밋뿐.
    - **stuck 주의:** 큰 작업이 20분(`ORCH_STUCK_SECS` 기본값) 초과 시 orch가 failed로 오탐. 장시간 예상되면 `ORCH_STUCK_SECS=7200 orch start`로 상향.
  - 같은 세션에서 subagent를 worktree 경로로 보내지 않는다.
- **Current repo checkout** → `git checkout <branch>`
  - Warn: may affect other sessions on same repo
  - 현재 세션에서 Step 7 실행 후 계속 진행

**Option A: Subagent-driven**

Invoke `superpowers:subagent-driven-development`.
- Fresh 서브에이전트가 Task별로 구현 + 테스트 + 커밋
- Spec compliance review → Code quality review 자동 수행
- 사용자는 리뷰 결과만 확인

**Option B: 직접 구현 (Guided TDD)**

메인 에이전트가 `superpowers:test-driven-development`를 따라 직접 구현.
사용자와 대화형 핑퐁으로 진행.

**Option C: 배치 실행 (Batch + Checkpoint)**

Invoke `superpowers:executing-plans`.
- 3개 Task씩 배치로 실행
- 배치 완료마다 결과 리포트 → 사용자 피드백 대기
- 피드백 반영 후 다음 배치 진행
- 블로커 발생 시 즉시 중단하고 사용자에게 확인

**For each feature/behavior in the plan:**

**7-gate.** Before starting each iteration:
> "다음 기능: [feature name]. TDD 사이클에 참여할까요?"
> - 참여 — 시나리오 선택 + 테스트 작성에 참여합니다
> - 패스 — AI가 테스트와 구현을 모두 처리합니다 (결과만 리뷰)

**If 패스:** AI runs the full TDD cycle autonomously (test → RED → implement → GREEN → refactor),
then presents a summary of what was tested and implemented. User reviews the result before moving on.

**If 참여, repeat:**

**7a.** AI proposes 2-3 test scenarios with tradeoffs.
> "이 기능에서 어떤 동작을 먼저 테스트할까요?"

**7b.** User selects scenario + defines key parameters (threshold, conditions, etc.)

**7c.** AI creates test file scaffolding (imports, fixtures, function signature + TODO marker).

**7d.** Ask user:
> "이 테스트 로직을 직접 작성할까요?"
> - 직접 작성 — TODO 부분을 채워주세요 (5-10줄)
> - AI에게 맡기기 — AI가 테스트 로직을 작성합니다

**7e.** Run test → **RED** 확인 (test must fail for the right reason).

**7f.** AI writes minimal implementation code to pass the test.

**7g.** Run test → **GREEN** 확인.

**7h.** Refactor if needed (keep tests green).

→ Repeat from 7-gate for the next feature.

### Step 8: Review & Verification (dispatching-parallel-agents pattern)

**AskUserQuestion으로 확인:**
> "구현 결과를 리뷰하고 검증할까요?"

Apply the `dispatching-parallel-agents` pattern to run independent review checks in parallel.

**8a: Parallel review dispatch**

Dispatch read-only review agents simultaneously:

```markdown
Agent 1 — Code Review (Option B/C만 — Option A는 built-in review가 있으므로 생략):
  "superpowers:requesting-code-review 패턴으로 코드 리뷰.
   Plan 파일(Step 5) 대비 구현 결과를 리뷰.
   출력: Critical/Important/Minor 이슈 리스트"

Agent 2 — Spec Reflection:
  "sc:reflect 패턴으로 원본 design.md 대비 구현 completeness 확인.
   출력: 누락된 요구사항, 스펙과의 차이점, 추가 구현 필요 항목"
```

**When to skip parallel dispatch:**
- Option A (Subagent-driven): built-in review가 있으므로 Agent 1 생략, Agent 2 (Reflection)만 실행
- 단순한 변경 (1-2 파일): 병렬 dispatch 대신 순차 실행도 가능

**Integrate results:**
- Read each Agent's findings
- Present combined review summary to user
- Critical/Important 이슈는 8b 전에 수정

**AskUserQuestion으로 확인 (8a → 8b 전환 게이트, 생략 금지):**
> "8a 리뷰 완료. Critical/Important 이슈가 있으면 지금 수정하세요. 8b 검증으로 진행할까요?"
> - 진행 — 8b Verification으로 이동
> - 이슈 수정 후 진행 — 수정 완료 후 8b로 이동
> - 생략 — 8c Coverage로 건너뜀

**8b: Verification, AskUserQuestion으로 확인:**

> "`superpowers:verification-before-completion`을 실행할까요, 아니면 생략할까요?"

**Environment setup:** If the project uses a virtualenv, activate it before running tests.
Especially important in worktree contexts where the venv is at the **original project root**, not the worktree.

Detection order:
1. `venv/`, `.venv/`, `env/` directory → `source $REPO_ROOT/<venv>/bin/activate`
2. `.python-version` file → pyenv auto-manages (verify with `which python`)
3. No venv file but pyenv installed → `pyenv versions` to find matching env by project name, then `PYENV_VERSION=<env-name> python -m pytest ...`

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
# venv/pyenv 감지 후 적절한 방식으로 활성화
```

**Django migration check:** Migration 유효성은 반드시 `plab.settings.local` (MySQL)로 확인. `plab.settings.test`는 `MIGRATION_MODULES = DisableMigrations()`로 마이그레이션이 비활성화되어 있어 `migrate --check`가 항상 통과하는 false negative 발생.
```bash
cd web && source ../.venv/bin/activate
DJANGO_SETTINGS_MODULE=plab.settings.local python manage.py migrate --check
```

**Django worktree test fallback:** Worktree에서 Django 테스트 시 Docker 기반 실행으로 fallback:
```bash
docker compose -f docker-compose.local.yml run --rm web python manage.py test -v 2
```
Docker도 불가능한 경우 구조적 검증(migration 파일 존재, 인덱스 정의 확인 등)으로 대체.

Invoke `superpowers:verification-before-completion`.

**Retry loop on failure:**
If verification fails (tests fail, lint errors, build errors):
1. Present the failure summary to the user
2. Ask: "수정 후 재검증할까요, 아니면 이 상태로 넘어갈까요?"
   - 재검증 → fix the issues, then re-run verification (repeat until pass or user skips)
   - 넘어가기 → proceed to next step with a warning
3. Maximum 3 automatic retries before asking user to intervene manually

**8c: Coverage — AskUserQuestion 필수 (질문 생략 금지):**

반드시 AskUserQuestion으로 확인. optional 항목이지만 질문 자체는 skip 불가.

> "커버리지 분석이 필요한가요?"

If yes → `sc:test --coverage` for coverage analysis and quality reporting.
If no → skip.

### Step 9: Commit

**AskUserQuestion으로 확인:**
> "변경사항을 커밋할까요, 아니면 생략할까요?"

**Worktree 흐름:** Worktree 세션에서 이미 커밋 완료. 이 단계를 자동 생략하되, **반드시 텍스트로 명시**: "Worktree에서 이미 커밋되었습니다 — Step 9 생략." Step 10과 합쳐서 AskUserQuestion 하지 않을 것. 별도 문장으로 알린 후 Step 10으로 넘어갈 것.

- Review staged/unstaged changes with `git status` and `git diff`
- Do NOT commit `docs/plans/` files — `git add` 시 명시적으로 제외
- Create commit with a clean, concise message (Korean)
- If multiple logical changes exist, suggest splitting into separate commits
- Optional: `sc:git commit --smart-commit` for intelligent commit message generation

### Step 10: PR Creation

**AskUserQuestion으로 확인:**
> "PR을 생성할까요, 아니면 생략할까요?"

**Pre-PR 필수 체크 (skip 불가 — 이 게이트를 통과해야 PR 생성 가능):**

**반드시 텍스트로 "## Pre-PR 필수 체크리스트" 헤딩을 먼저 출력한 후 아래 항목을 순서대로 실행.** 조용히 넘어가거나 PR 생성 직전에 생략하지 않을 것.

1. **신규 환경변수 점검** — git diff로 이번 PR에서 새로 추가된 env var 탐지:
   ```bash
   git diff main...HEAD -- | grep "^+" | grep -E "os\.environ\.get|os\.getenv|process\.env\." | grep -v "^+++"
   ```
   - 새 env var가 있으면 → 목록을 사용자에게 표시하고 `.env` / README / 배포 문서에 기록됐는지 확인 요청
   - 없으면 → 자동 통과 (`.env.example` 체크 불필요 — 프로젝트에 `.env.example` 없음)
2. 로컬 서버 기동 확인 — 서버가 정상 구동되는지 확인 후 Ctrl+C로 종료
   - **pf-server-django:** `source venv/bin/activate && cd web && python manage.py runserver`
   - **CDK 프로젝트:** `cdk synth` 성공으로 대체
   - **Zappa/Lambda Django 프로젝트 (stadiumDjango 등):** `local.py` settings는 env var 기반 — SM 불필요, 로컬 기동 가능. `PYENV_VERSION=<env> python manage.py runserver --settings=<app>.settings.local` 실행. "Lambda라서 로컬 실행 불가" 판단 금지.
   - 그 외 프로젝트: `python manage.py runserver` 등 프로젝트별 명령 사용
3. 전체 테스트 suite **실행** (결과 출력 필수)
   - 테스트 명령을 실제로 실행하고 pass/fail 결과를 확인할 것
   - 테스트가 없거나 runner 미설치인 경우: "테스트 없음 — 생략" 이라고 명시. 조용히 ✅ 처리 금지
   - 실패 시 PR 생성 전 수정 또는 사용자에게 명시적으로 알릴 것

Invoke `superpowers:finishing-a-development-branch`.
- **PR must be assigned to current `gh auth` user** — always include `--assignee @me` in `gh pr create`

**PR Title:** `[DEV-XXXX] type: 간결한 설명`

**PR Body (Work):**
```
## Summary
## Changes
## Test Plan
## Jira
- https://myplaycompany.atlassian.net/browse/DEV-XXXX
```

**PR Body (Personal):**
```
## Summary
## Changes
## Notes
```

Personal mode: update Notion page `PR` property with PR URL after creation.

**Worktree cleanup after PR:**
If a worktree was used (Step 7), clean it up after PR creation:
1. **커밋 확인 먼저** — worktree에 uncommitted changes가 없는지 반드시 검증:
   ```bash
   git -C <worktree-path> status --porcelain
   ```
   - 출력이 있으면 → 사용자에게 경고하고 커밋 또는 폐기 여부 확인 후 진행
   - 출력이 비어있으면 → 안전하게 삭제 가능
2. **삭제 대상 확인** — worktree 내 다음 항목은 커밋 불필요 (삭제 대상):
   - `docs/plans/*.md` (워크플로우 문서, git add 제외 대상)
   - `venv` symlink (worktree 전용)
   - 작업과 무관한 수정 파일 (예: 탐색 중 발생한 변경)
3. **Worktree 삭제:**
   ```bash
   git worktree remove --force <worktree-path>
   ```
   `--force` — docs/plans, venv 등 untracked 파일이 남아있어도 삭제 가능.
   실패 시 fallback: `rm -rf <worktree-path> && git worktree prune`

## Context Enrichment (available at any step)

At any point during the workflow, the user may provide additional context sources.
When the user says something like "Notion 페이지도 참고해줘" or "이 Slack 스레드 봐줘":

1. Invoke the appropriate parser (`parse:notion`, `parse:slack`, `parse:jira`)
2. Add the parsed output to the running context
3. Resume the current step with enriched context

This is not a separate step — it's a utility that can interrupt any step.

## Session Handoff (Worktree Flow)

When worktree is selected in Step 7, the workflow splits across two sessions:

```
Original Session (this terminal)          Worktree Session (new terminal)
─────────────────────────────────         ─────────────────────────────────
Step 1-6: Context → Plan → Exec Method
Step 7: Create worktree, STOP
  ↓ "새 터미널에서 작업하세요"
  │                                       cd <worktree-path> && claude --dangerously-skip-permissions
  │                                       "superpowers:<chosen-skill>로 docs/plans/<file>.md 계획을 실행해줘"
  │                                       → skill name in prompt ensures correct invocation
  │                                       → implements all tasks
  │                                       → commits changes in worktree
  │                                       → "원래 터미널로 돌아가세요"
  ↓ "작업 완료"
Ask: 로컬 서버 확인 여부 → 사용자 확인 후
Step 8-10: Review → Commit → PR → Worktree cleanup
```

**Launch modes:** The "Worktree Session" above can be opened two ways — 수동(새 터미널에 `cd <worktree> && claude --dangerously-skip-permissions` 붙여넣기) 또는 orch 무인 위임(`orch add <worktree> "..."`, 원래 세션 유지·병행 가능). 둘 다 skip-perms + worktree 격리 동일. orch 위임 시 진행은 `orch ls`로 관찰, 산출물은 worktree 커밋뿐 (orch 세션과 직접 대화 안 함).

**Original session resume trigger:** User says "작업 완료" (or similar).
When resumed, before Step 8, **AskUserQuestion으로 확인:**
> "로컬 서버를 실행해서 변경사항을 직접 확인하시겠어요?"
> - 예, 확인 후 진행 — 서버 실행 명령을 안내하고 사용자가 확인 후 진행 신호를 줄 때까지 대기
> - 아니오, 바로 Step 8 — 서버 확인 없이 Review & Verification으로 진행
Then continue from Step 8.

## Enforcement Rules

### Every Step Gets a User Prompt (Tier-aware)
확인 강도는 Step 0에서 정한 tier를 따른다. 균일 확인은 이해부채를 못 줄이고 ritual만 만든다.

- **Tier C:** 모든 step(1-10) MUST AskUserQuestion으로 확인. 어떤 step도 확인 없이 생략/자동실행 금지. (기존 기본 동작 유지 — 이해를 지켜야 할 영역.)
- **Tier B:** 설계 게이트(Step 2, 5)와 실행/PR 게이트(Step 6, 8, 10)는 확인 필수. Step 1/4/7/9는 판단에 따라 자동 진행 후 **텍스트로 통보** 가능 (조용한 생략은 여전히 금지).
- **Tier A:** Step 2/4/5 자동 생략 제안 후 진행. 실행은 Batch/Subagent로 묶고, 되돌리기 힘든 게이트(Step 8 verification, Step 10 Pre-PR 체크)만 확인. 나머지는 통보.

**공통 하한 (tier 무관, 절대 생략 금지):** Step 8b Verification(테스트 실행), Step 10 Pre-PR 필수 체크리스트. 이 둘은 Tier A라도 반드시 실행.

### Anti-Ritual Device (Tier C, Step 8a)
클로드 리뷰 = 도장만 찍기가 되면 자동리뷰 넘기는 것과 본질이 같다. Tier C 작업은 8a 병렬 리뷰 dispatch **전에**:
> "이 변경에서 네가 예상하는 문제 지점 2-3개를 먼저 적어주세요 (클로드 리뷰와 대조합니다)."

사용자 예상 ↔ 클로드 리뷰 결과를 나란히 제시. 겹치면 이해 정합성 확인, 어긋나면 어느 쪽이 맞는지 토론. 사용자가 "그냥 클로드 결과 보여줘"로 스킵하면 → 텍스트로 경고: "이번 리뷰는 도장 모드입니다 (뇌 미개입)." 강제하지는 않되 가시화한다.

### External Skill Transitions are Overridden
외부 스킬(brainstorming, writing-plans 등)이 자체적으로 "다음 스킬을 invoke하라"고 지시할 수 있다.
**dev-workflow 안에서는 이러한 외부 transition 지시를 모두 무시하라.**
다음 단계는 항상 dev-workflow의 Step 번호 순서를 따른다.
예: brainstorming이 "→ invoke writing-plans"라고 해도, dev-workflow에서는 Step 3 (Setup)이 다음이다.

### No Ambiguous Phrasing
- Banned: "바로 진행할까요?", "바로 구현할까요?"
- Required: explicitly name the next step/skill

### AskUserQuestion Options Must Match Skill Definition
When a step specifies exact `label` and `description` values, use them **verbatim**.
Do NOT paraphrase, simplify, or inject task-specific details into option descriptions.
Do NOT reorder options from the order specified in the skill.

### Step Skip = User Confirmation
Before skipping any step:
> "[step name] 생략할까요?"

### Plan Header Skill Directive is Authoritative
The plan file header (`> **For Claude:** Use superpowers:X ...`) specifies which skill the worktree session must invoke. The worktree session MUST invoke that exact skill — not a substitute (e.g., `executing-plans` instead of `subagent-driven-development`). The plan header is written in Step 6 precisely to control worktree session behavior.

### Worktree = Stop Current Session
If user selects Worktree in Step 7:
- Create worktree and announce the path
- Write execution method to plan file header before copying to worktree
- Launch the implementation session by the chosen mode (수동 새 터미널 or `orch add` 무인 위임) — both isolate in the worktree with skip-perms; orch auto-builds the command from known worktree/plan/skill paths (no manual paste)
- Tell user to execute plan (or monitor via `orch ls`) and return with "작업 완료" when done
- **Stop the current session.** Do NOT continue with execution in the same session (orch spawns a separate detached session — not the current one).
- "현재 레포 checkout"을 선택한 경우에만 같은 세션에서 계속 진행

### No Step Skipping After Execution
After execution (Step 7) completes, Steps 8-10 must each be asked in order.
Never jump from execution directly to finishing.

## Entry Points

This workflow is triggered after:
1. `parse:slack` completes → 워크플로우 선택에서 "dev-workflow" 선택
2. `parse:notion` completes → 워크플로우 선택에서 "dev-workflow" 선택
3. `parse:jira` completes → 워크플로우 선택에서 "dev-workflow" 선택
4. `superpowers:systematic-debugging` root cause found → brainstorming for solution
5. User directly requests feature/fix work
6. Existing Jira ticket URL provided → Step 1 detects it, Step 3 skips ticket creation
7. User says "작업 완료" → resume from Step 8 (after worktree session)

## On-Demand Skills (removed from workflow, available anytime)

These skills were removed as dedicated steps but can be invoked manually when needed:
- **`sc:estimate`** — 공수 산정. Sprint planning이나 대규모 기능에서 필요 시 직접 호출.
- **`ops:production-safety-audit`** — AWS 인프라 + 코드 패턴 안전성 검사. 배포 전 필요 시 직접 호출.
