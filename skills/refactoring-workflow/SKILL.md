---
name: refactoring-workflow
description: Use when starting a refactoring task — code-level, module-level, architectural, or tech debt campaigns. Orchestrates analysis through PR creation with safety-first GREEN→GREEN execution model. Triggers on refactoring requests, code improvement tasks, or tech debt cleanup.
---

# Refactoring Workflow Orchestrator

## Overview

Orchestrator for all refactoring workflows — from surgical method extractions to codebase-wide tech debt campaigns.
Uses a GREEN→GREEN safety model: tests must pass before AND after every refactoring step.
Shares infrastructure with dev-workflow (context gathering, setup, finishing) while providing analysis-first flow.

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

## NOTE

> **Status: UNTESTED** — 아직 한 번도 실행하지 않았음. 실제 사용 후 조정 필요.

### Initial prompt이 불명확함
- Step 0 (Context Gathering)이 Slack/Jira/Notion 파싱으로 시작하는데, 리팩토링은 보통 외부 소스 없이 **내 생각**으로 시작함
- "이 클래스 구조가 복잡해서 정리하고 싶다" 같은 자유 입력이 더 자연스러운 시작점
- Step 0을 리팩토링에 맞게 재설계하거나, Step 1 (Scope & Analysis)을 실질적 시작점으로 만드는 것을 고려
- 현재 Step 0은 dev-workflow에서 그대로 가져온 것이라 refactoring context에 최적화되지 않음

### dev-workflow에서 가져온 공유 Step 상세 내용 부족
아래 공유 Step들은 dev-workflow에서 가져왔지만, 현재 SKILL.md에는 요약만 있고 상세 동작이 빠져 있음.
실제 사용 시 dev-workflow SKILL.md의 해당 Step을 참고하여 상세 내용을 인라인할 것:

- **Step 0 (Context Gathering):** auto-detect 로직, 파서 호출 상세, 복수 소스 결합 등
- **Step 3 (Setup):** 모드별 skill 호출, 티켓 재사용 판단 로직, 브랜치 생성 상세
- **Step 6 (Estimation):** `sc:estimate` 호출 로직, 스프린트 계획 연동 등
- **Step 7 (Execution Method):** 선택 후 plan file header에 실행 방법 기록하는 상세 포맷 (`> **For Claude:** Use superpowers:subagent-driven-development ...` 등)
- **Step 9 (Verification):** `superpowers:verification-before-completion` + `sc:test` 호출 순서, 커버리지 리포트 등
- **Step 10 (Reflection):** `sc:reflect` 호출 시 어떤 컨텍스트를 넘기는지
- **Step 11 (Production Safety Audit):** 어떤 프로젝트에서 추천하는지 기준
- **Step 12 (Finishing):** PR 생성 시 `docs/plans/` 제외, PR assign, Notion PR property 업데이트 등 상세 로직

→ 첫 실행 테스트 후, 필요한 상세 내용을 dev-workflow에서 복사하여 인라인할 것.

## Workflow Steps

### Step 0: Context Gathering

Before analysis, detect and collect all available context.

**Auto-detect:** Scan `docs/plans/` for recent `*-input.md` files (today or yesterday).
If found, list them and confirm: "이 파일들을 컨텍스트로 사용할까요?"

**Ask for additional sources:**

> "추가 컨텍스트 소스가 있나요?"
> - Jira 티켓 URL → `parse:jira` 실행
> - Notion 페이지 URL → `parse:notion` 실행
> - Slack 스레드 URL → `parse:slack` 실행
> - 없음 (직접 설명하겠습니다)

Multiple sources can be combined. Each parser outputs to `docs/plans/*-input.md`.

**When Jira ticket already exists:**
If a Jira input file is detected or provided, extract the ticket key (e.g., DEV-3131).
This ticket will be reused in Step 3 (Setup) — no need to create a new one.

### Step 1: Scope & Analysis

> "리팩토링 대상의 범위를 선택하세요:"
> - 함수/메서드 레벨 (code-level)
> - 모듈/파일 레벨 (module-level)
> - 아키텍처 레벨 (architecture-level)
> - 기술 부채 캠페인 (tech debt campaign)

After scope selection, run `sc:analyze` on the target area.
Present findings: complexity, code smells, duplication, dependency issues.

> "분석 결과를 확인했습니다. 어떤 문제를 우선 해결할까요?"

Let user pick which findings to address. This prioritized list feeds into brainstorming.

### Step 2: Refactoring Brainstorming

> "`superpowers:brainstorming`으로 리팩토링 설계를 진행할까요, 아니면 생략할까요?"

Invoke `superpowers:brainstorming` with refactoring-specific context:
- sc:analyze results from Step 1
- Scope level selected
- User's prioritized findings

Brainstorming focus by scope:
- code-level: refactoring techniques (extract method, inline, simplify conditional)
- module-level: reorganization (split, merge, boundary changes)
- architecture-level: target architecture, incremental migration strategy
- tech debt campaign: migration strategy, automated codemods vs manual

Output: `docs/plans/YYMMDD-<topic>-design.md`

### Step 3: Setup

**Detect if a tracker ticket already exists** from Step 0 context.

**When ticket already exists (from Step 0):**
> "Jira 티켓 DEV-XXXX이 이미 있습니다. 브랜치만 생성할까요, 아니면 생략할까요?"

If yes, create branch using the existing ticket key (e.g., `refactor/DEV-XXXX-description`). Skip ticket creation.

**When no ticket exists:**

**Personal mode:**
> "`personal-setup-work`로 Notion 태스크와 브랜치를 생성할까요, 아니면 생략할까요?"

**Work mode:**
> "`setup-work`로 Jira 티켓과 브랜치를 생성할까요, 아니면 생략할까요?"

Invoke the mode-appropriate skill. Branch prefix: `refactor/` instead of `feature/`.

### Step 4: Deep Exploration

> "리팩토링 영향 범위를 탐색할까요, 아니면 생략할까요?"

Recommended for: module-level, architecture-level, tech debt campaigns.
Can skip for: small code-level refactors where scope is already clear.

If yes, launch parallel `Task(subagent_type=Explore)` agents:
- Agent 1: "리팩토링 대상의 모든 참조와 의존성을 추적해라" (dependency map)
- Agent 2: "관련 테스트 커버리지를 분석하고 테스트 없는 영역을 식별해라" (test coverage gaps)
- Agent 3 (architecture-level only): "대상 모듈의 인터페이스와 외부 계약을 매핑해라" (API surface)

Additionally run `sc:improve` in analysis-only mode to identify specific refactoring opportunities and risk areas.

Share results with user before proceeding.

### Step 5: Refactoring Plan

> "`superpowers:writing-plans`로 리팩토링 계획을 작성할까요, 아니면 생략할까요?"

Invoke `superpowers:writing-plans`. Plan includes standard format plus:

**Safety Constraints section (mandatory):**
- Baseline: all tests must pass BEFORE any changes
- Invariant: tests must pass AFTER each refactoring step (not just at the end)
- Scope guard: changes must not alter external behavior (unless explicitly planned)

**Refactoring Steps format:**
Each step is a single, independently-verifiable refactoring:
```
Step N: [refactoring technique] on [target]
- Files: modify X, Y
- Safety: run tests after this step
- Rollback: revert this commit if tests fail
```

Plan header metadata:
- Personal: `**Notion:** DEV-XX`
- Work: `**Jira:** DEV-XXXX`

### Step 6: Estimation

> "`sc:estimate`로 공수 산정할까요, 아니면 생략할까요?"

Recommended for: work projects with sprint planning, large refactors.
Personal projects: recommend skipping, but still ASK the user.

### Step 7: Execution Method

> "실행 방법을 선택하세요:"
> - A) `superpowers:subagent-driven-development` — 서브에이전트가 Task별 자율 리팩토링
> - B) 직접 구현 (Guided) — 매 리팩토링 단계마다 사용자 참여 여부를 묻고 대화형으로 진행

**After user selects:** Update the plan file header with the chosen execution method.

### Step 8: Worktree/Checkout & Execution

> "Worktree로 격리할까요, 아니면 현재 레포에서 checkout할까요?"

- **Worktree** → `superpowers:using-git-worktrees`
  - Copy plan file to worktree
  - **현재 세션은 여기서 멈춤.** 사용자에게 안내:
    > "Worktree가 `<path>`에 생성되었습니다.
    > 1. 해당 경로에서 새 터미널을 열고 `claude`를 실행하세요.
    > 2. `docs/plans/<plan-file>.md 계획을 실행해줘` 라고 입력하세요.
    > 3. 작업이 완료되면 이 터미널로 돌아와서 '작업 완료' 라고 입력하세요."
- **Current repo checkout** → `git checkout <branch>`

#### Baseline Gate (BEFORE any changes)

```
Run full test suite → must be GREEN
If RED: "테스트가 실패합니다. 먼저 테스트를 수정할까요, 아니면 현재 상태에서 계속할까요?"
```

#### GREEN→GREEN Refactoring Cycle

For each refactoring step in the plan:

**8-gate.** Before starting each step:
> "다음 리팩토링: [step name]. 참여할까요?"
> - 참여 — 리팩토링 방법을 함께 결정합니다
> - 패스 — AI가 처리합니다 (결과만 리뷰)

**If 패스:** AI runs the full cycle autonomously, then presents summary.

**If 참여:**
1. AI proposes the refactoring approach with tradeoffs
2. User confirms or adjusts
3. Apply the refactoring (single technique, single target)
4. Run tests → must stay GREEN
5. If RED → revert and report: "Step N에서 테스트 실패. 원인: ..."
6. If GREEN → commit: `refactor: [technique] on [target]`
7. Move to next step

**After all steps complete:**
- Run full test suite one final time
- Generate before/after summary (complexity metrics, line count, etc.)

### Step 9: Verification

> "`superpowers:verification-before-completion`을 실행할까요, 아니면 생략할까요?"

Invoke `superpowers:verification-before-completion`.
Run `sc:test` for coverage analysis and quality reporting.

**Refactoring-specific additions:**
- Before/after diff summary (lines changed/removed/added)
- Complexity metrics comparison (if available from sc:analyze)
- Test count validation: refactoring should not change test count
- Present: "리팩토링 결과 요약입니다. 확인해주세요."

### Step 10: Reflection

> "`sc:reflect`로 리팩토링 결과를 설계 대비 검증할까요, 아니면 생략할까요?"

Validates refactoring outcome against the design from Step 2.
Recommended for: module-level and architecture-level refactoring.

### Step 11: Production Safety Audit

> "`/ops:production-safety-audit` 실행할까요, 아니면 생략할까요?"

Recommended for work projects with AWS infrastructure.

### Step 12: Finishing

> "`superpowers:finishing-a-development-branch`로 PR을 생성할까요, 아니면 생략할까요?"

Invoke `superpowers:finishing-a-development-branch`.
- Do NOT commit `docs/plans/` files
- PR assigned to current `gh auth` user

**PR Title:** `[DEV-XXXX] refactor: 간결한 설명`

**PR Body (Work):**
```
## Summary
## Refactoring Changes
## Before/After
## Test Plan
## Jira
- https://myplaycompany.atlassian.net/browse/DEV-XXXX
```

**PR Body (Personal):**
```
## Summary
## Refactoring Changes
## Before/After
## Notes
```

Personal mode: update Notion page `PR` property with PR URL after creation.

## Context Enrichment (available at any step)

At any point during the workflow, the user may provide additional context sources.
When the user says something like "Notion 페이지도 참고해줘" or "이 Slack 스레드 봐줘":

1. Invoke the appropriate parser (`parse:notion`, `parse:slack`, `parse:jira`)
2. Add the parsed output to the running context
3. Resume the current step with enriched context

## Session Handoff (Worktree Flow)

When worktree is selected in Step 8, the workflow splits across two sessions:

```
Original Session                              Worktree Session
─────────────────────────────────             ─────────────────────────────────
Step 0-7: Context → Plan → Method
Step 8: Create worktree, STOP
  ↓ "새 터미널에서 작업하세요"
  │                                           cd <worktree-path> && claude --dangerously-skip-permissions
  │                                           "docs/plans/<file>.md 계획을 실행해줘"
  │                                           → baseline gate → GREEN→GREEN cycle
  │                                           → "원래 터미널로 돌아가세요"
  ↓ "작업 완료"
Step 9-12: Verify → Reflect → Audit → PR
```

**Original session resume trigger:** User says "작업 완료" (or similar).

## Enforcement Rules

### Every Step Gets a User Prompt
Every step (0-12) MUST present its prompt to the user via AskUserQuestion.
No step is skipped without user confirmation. No step is auto-executed without asking.

### No Ambiguous Phrasing
- Banned: "바로 진행할까요?", "바로 리팩토링할까요?"
- Required: explicitly name the next step/skill

### Step Skip = User Confirmation
Before skipping any step:
> "[step name] 생략할까요?"

### Worktree = Stop Current Session
If user selects Worktree in Step 8:
- Create worktree and announce the path
- Write execution method to plan file header before copying to worktree
- Tell user to open new terminal, execute plan, and return when done
- **Stop the current session.** Do NOT continue with execution in the same session.

### No Step Skipping After Execution
After execution (Step 8) completes, Steps 9-12 must each be asked in order.
Never jump from execution directly to finishing.

### GREEN→GREEN Invariant
During execution (Step 8), tests must pass after EVERY refactoring step.
If tests fail after a step, revert that step and report. Never continue with failing tests.

## Entry Points

This workflow is triggered when:
1. User requests refactoring, code improvement, or tech debt cleanup
2. Jira/Notion ticket is tagged as refactoring
3. After `sc:analyze` reveals significant structural issues
4. After `superpowers:systematic-debugging` → root cause is structural
5. User says "작업 완료" → resume from Step 9 (after worktree session)
