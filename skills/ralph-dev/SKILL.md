---
name: ralph-dev
description: Use when task is well-defined with clear success criteria and you want autonomous iteration — wraps ralph-loop plugin with infrastructure (context parsing, ticket/branch, worktree, PR). Alternative to dev-workflow for "just build it" development.
---

# Ralph-Dev Workflow

## Overview

Autonomous iteration workflow. Wraps the `/ralph-loop:ralph-loop` plugin with infrastructure bookends: context parsing, ticket/branch setup, worktree isolation, and PR creation.

**Core:** ralph-loop's autonomous iteration (stop-hook-based, zero interaction).
**Wrapper:** parse, ticket, branch, worktree, commit, PR.

Choose this over dev-workflow when: task is well-defined with clear success criteria and you want autonomous execution.
Choose this over explore-dev when: you don't need deep codebase exploration or architecture design.

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

### Step 0: Context Gathering

> "컨텍스트 소스가 있나요?"
> - Jira 티켓 URL → `parse:jira` 실행
> - Notion 페이지 URL → `parse:notion` 실행
> - Slack 스레드 URL → `parse:slack` 실행
> - 없음 (직접 설명하겠습니다)

Multiple sources can be combined. Each parser outputs to `docs/plans/*-input.md`.
If Jira ticket detected, extract ticket key for reuse in Step 1.

### Step 1: Setup (Ticket + Branch) — MANDATORY

Branch creation is mandatory. Ralph-loop commits freely during iteration, so it must never run on main/production.

| Situation | Ticket | Branch |
|-----------|--------|--------|
| Existing ticket from Step 0 (parsed Jira) | Reuse DEV-XXXX | Create from existing ticket |
| No existing ticket, personal mode | Create Notion task | Create from task |
| No existing ticket, work mode | Create Jira ticket | Create from ticket |

**When ticket already exists (from Step 0):**
> "Jira 티켓 DEV-XXXX이 이미 있습니다. 브랜치를 생성합니다."

Create branch using existing ticket key. Skip ticket creation.

**When no ticket exists:**

**Personal mode:**
> "Notion 태스크와 브랜치를 생성합니다."

Uses `personal-setup-work` skill.

**Work mode:**
> "Jira 티켓과 브랜치를 생성합니다."

Uses `setup-work` skill.
All mandatory fields (6 for Jira) still required.

**If user tries to skip:**
> "브랜치 생성은 필수입니다. 티켓 없이 브랜치만 생성할까요?"

Branch naming:
- With ticket: `feature/DEV-XXXX-<topic>`
- Without ticket: `feature/<topic>`

### Step 2: Plan Writing (optional)

> "구현 계획을 작성할까요?"

If yes → invoke `superpowers:writing-plans`.
- **Filename format:** `YYMMDD-` prefix (NOT `YYYY-MM-DD-`)
- Work: `docs/plans/YYMMDD-DEV-XXXX-<topic>-plan.md`
- Personal: `docs/plans/YYMMDD-DEV-XX-<topic>-plan.md`
- This plan file becomes the reference ralph-loop reads during iteration

**IMPORTANT — Plan header override:**
`writing-plans` generates a default header with `superpowers:executing-plans`. This is WRONG for ralph-dev.
After `writing-plans` generates the plan, replace the "For Claude" directive line with:
```markdown
> **For Claude:** This plan is executed via `/ralph-loop:ralph-loop` (autonomous iteration). Do NOT use superpowers:executing-plans.
```

**Skip writing-plans Execution Handoff:** `writing-plans`는 끝에 "Subagent-Driven vs Parallel Session" 선택을 제안하지만, ralph-dev에서는 이 선택을 무시하고 Step 3으로 진행한다. 실행 방법은 항상 `/ralph-loop:ralph-loop`.

If skipped → user provides the task description directly in Step 3.

### Step 3: Ralph-loop Parameters

Ask two questions:
1. Completion promise (default: "All tasks implemented and tests pass")
2. Max iterations (default: 20)

**Prompt construction:**

If plan exists (Step 2) → auto-construct prompt referencing the plan file:
```
/ralph-loop:ralph-loop "Implement all tasks with TDD (test → RED → implement → GREEN → refactor for each task). Read the full plan at docs/plans/<filename>.md" --completion-promise "<PROMISE>" --max-iterations <N>
```

If no plan → ask user for the task prompt, then construct:
```
/ralph-loop:ralph-loop "<USER_PROMPT>" --completion-promise "<PROMISE>" --max-iterations <N>
```

The full command is stored for display in Step 4.

### Step 4: Worktree / Checkout

> "Worktree로 격리할까요, 현재 레포에서 checkout할까요?"

**Worktree:**
- Create with existing branch from Step 1 (`git worktree add "$path" "$BRANCH_NAME"`, **`-b` 플래그 없이**)
- `superpowers:using-git-worktrees`로 worktree 생성
- **pf-server-django venv 연결:** `ln -s /Users/jw/work/pf-server-django/venv <worktree-path>/venv`
- Copy plan file to worktree (if exists from Step 2)
- **현재 세션은 여기서 멈춤.** Display ready-to-copy instructions:
  > "Worktree가 `<path>`에 생성되었습니다.
  > 새 터미널에서:
  > ```bash
  > cd <worktree-absolute-path> && claude --dangerously-skip-permissions
  > ```
  > 그 후 아래 명령어를 실행하세요:
  > ```bash
  > /ralph-loop:ralph-loop "Implement all tasks with TDD. Read the full plan at docs/plans/<filename>.md" --completion-promise "<PROMISE>" --max-iterations <N>
  > ```
  > 작업이 완료되면 이 터미널로 돌아와서 '작업 완료'라고 입력하세요."
- **중요:** `<worktree-absolute-path>`를 실제 절대 경로로 치환할 것.

**Current repo checkout:**
- `git checkout <branch>`
- 현재 세션에서 Step 5 계속 진행

### Step 5: Ralph-loop Core

- **Current repo checkout:** Execute `/ralph-loop:ralph-loop` directly in current session using the command from Step 3
- **Worktree:** Already running in worktree session (this step is implicit)

### Step 6: Commit

- **Worktree flow:** Commit in worktree session before returning to original session
- **Current repo flow:** Commit in current session
- `docs/plans/` 파일은 `git add` 시 명시적으로 제외
- Korean commit message
- 여러 논리적 변경이 있으면 분리 커밋 제안

**Worktree session completion:**
When ralph-loop finishes in the worktree session:
1. Commit all changes (exclude `docs/plans/`)
2. Tell the user:
> "구현이 완료되었습니다. 원래 터미널(세션)로 돌아가서 '작업 완료'라고 입력하세요.
> PR 생성은 원래 세션에서 진행합니다."

### Step 7: PR Creation

> "PR을 생성할까요?"

Invoke `superpowers:finishing-a-development-branch`.
- `--assignee @me` always

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
```bash
git -C <worktree-path> status --porcelain  # uncommitted changes 확인
git worktree remove --force <worktree-path>
```
실패 시 fallback: `rm -rf <worktree-path> && git worktree prune`

## Session Handoff (Worktree Flow)

```
Original Session                    Worktree Session
────────────────                    ────────────────
Step 0-4: Context → Setup → Plan
  → create worktree, STOP
                                    cd <worktree> && claude --dangerously-skip-permissions
                                    /ralph-loop:ralph-loop "<prompt>" --completion-promise "X" --max-iterations N
                                    → autonomous iteration until done
                                    → commits in worktree (Step 6)
                                    → "원래 터미널로 돌아가세요"
  ← "작업 완료"
Step 7: PR → cleanup
```

**Original session resume trigger:** User says "작업 완료" (or similar).
When resumed, continue from Step 7.

## Enforcement Rules

### Branch is Mandatory
Step 1 cannot be skipped entirely. Branch must be created before ralph-loop execution.

### Every Step Gets a User Prompt
Every step (0-7) MUST present its prompt to the user via AskUserQuestion.
No step is skipped without user confirmation.

### Worktree = Stop Current Session
If user selects Worktree in Step 4:
- Create worktree with full `/ralph-loop:ralph-loop` command in instructions
- **Stop the current session.** Do NOT continue.

### Ralph-loop Command is Pre-constructed
The full `/ralph-loop:ralph-loop` command (prompt + flags) is auto-constructed from Steps 2-3 and displayed ready-to-copy. User should not need to manually construct it.

## Entry Points

1. `parse:slack` completes → 워크플로우 선택에서 "ralph-dev" 선택
2. `parse:notion` completes → 워크플로우 선택에서 "ralph-dev" 선택
3. `parse:jira` completes → 워크플로우 선택에서 "ralph-dev" 선택
4. User directly invokes `/ralph-dev`
