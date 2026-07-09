---
name: dev-workflow
description: Use when starting any development task — after parsing external input (Slack, Notion, Jira) or when user requests a feature, bugfix, or refactoring. Autonomous pipeline from parse to PR with two human gates (kickoff approval + async PR review). Triggers on development requests, parsed inputs, or explicit workflow invocation.
---

# Development Workflow (Autonomous)

## Overview

Single autonomous pipeline: **parse → PR, zero intervention except two gates.**
Detects project mode from working directory. Absorbs the old ralph-dev — the execution engine
is `/ralph-loop:ralph-loop` (TDD inside each iteration).

**Design:** `~/.claude/docs/plans/0709-design-autonomous-dev-workflow.md`

**The two gates (only synchronous human touches):**
1. **Kickoff** — approve the auto-generated plan (go / adjust / cancel).
2. **PR review** — async, on GitHub. Review the PR the loop created; merge is a human call.

Everything between — parse, ticket, worktree, brainstorm, explore, plan, TDD implementation,
verification, commit, PR creation — is unattended. The loop runs detached via `orch`, so the main
session stays free to fan out more tasks in parallel.

## Mode Detection

```bash
if [[ "$PWD" == "$HOME/prv/"* ]]; then
  MODE=personal
  # setup skill: personal-setup-work ; tracker: Notion (DEV-XX) ; github: jongwoo315
else
  MODE=work
  # setup skill: setup-work ; tracker: Jira (DEV-XXXX) ; github: kimwoz
fi
```

## Scope Guard

dev-workflow = **PR-shipping code only.** Infra / DB migration-only / console-direct deploys
(Lambda deployed by CLI, not PR) → route to `infra-workflow` + `infra-safety-gate`. Do NOT run
the autonomous loop on irreversible non-PR deploys.

---

## Phase A — Kickoff Prep (all automatic, no AskUserQuestion)

Runs in the main session. Everything lands in the worktree. No loop running yet, so the main
session is not hijacked.

### A1. Context detect
From the kickoff input, auto-detect URLs — no "source?" question:
- Jira URL → `parse:jira` (extract ticket key, e.g. DEV-3131, for reuse in A2)
- Notion URL → `parse:notion`
- Slack URL → `parse:slack`
- Multiple URLs → run multiple parsers. Each writes `docs/plans/*-input.md`.
- No URL → use the user's direct task description.

### A2. Ticket + branch (default fields, no ask)
- **Existing ticket (from A1):** reuse key. Create branch, skip ticket creation.
- **No ticket, work mode:** invoke `setup-work` headless with default fields:
  Issue Type `Dev`, Parent `DEV-3637`, Labels `Backend`, Priority `Medium (3)`,
  Story Points `3`, Assignee @me, Start today.
  *(Parent + Labels are placeholders — user refines post-merge.)*
- **No ticket, personal mode:** invoke `personal-setup-work` headless: title from parse/brainstorm,
  상태=진행, ID auto, rest empty.
- Branch: `feature/DEV-XXXX-<topic>` (with ticket) or `feature/<topic>` (without).
- **Announce** the defaults used (text, not a question).

### A3. Worktree (worktree-first)
- `superpowers:using-git-worktrees` from the **existing** branch:
  `git worktree add "$path" "$BRANCH_NAME"` (no `-b`).
- **Skip the "Verify Clean Baseline" test step** of using-git-worktrees.
- Symlink venv/.env so the detached loop can boot the server for Pre-PR checks:
  ```bash
  REPO_ROOT=$(git rev-parse --show-toplevel)
  ln -s "$REPO_ROOT/venv" <worktree>/venv
  [ -f "$REPO_ROOT/.env" ] && ln -s "$REPO_ROOT/.env" <worktree>/.env
  ```

### A4. Auto brainstorm / explore / plan (inside worktree)
- **Triage tier** — auto-assign (no ask). Signals: Tier A = boilerplate/CRUD/config/docs,
  reversible, fully test-covered. Tier B = new logic, multi-file, pattern variation.
  Tier C = domain-core logic, data model/schema, migration, auth/security, concurrency, payments,
  hard to reverse. Infra/DB/security forced ≥C (but those route out per Scope Guard). State the
  one-line rationale. Tier tunes depth below + shown in the kickoff.
- **Brainstorm** — `superpowers:brainstorming` for Tier B/C → `docs/plans/YYMMDD-<topic>-design.md`.
  **Skip for Tier A.** Ignore brainstorming's own "→ writing-plans" transition; plan is A4's job.
- **Explore** — `dispatching-parallel-agents` (`Task(subagent_type=Explore)`) **only if** Tier C or
  brainstorm flags unknowns. Focused scope per agent, structured output. Else skip.
- **Plan** — always `superpowers:writing-plans` → `docs/plans/YYMMDD-DEV-XX-<topic>-plan.md`
  (`YYMMDD` prefix, NOT `YYYY-MM-DD`). Plan header directive MUST be:
  ```markdown
  > **For Claude:** This plan is executed via /ralph-loop:ralph-loop (autonomous TDD iteration).
  > Do NOT use superpowers:executing-plans or subagent-driven-development.
  ```
  Header metadata: `**Tier:** [X]`, `**Jira:** DEV-XXXX` (or `**Notion:** DEV-XX`).

---

## GATE 1 — Kickoff Approval (the one synchronous gate)

**AskUserQuestion:**
```
Tier: [X] — [one-line rationale]
Plan: docs/plans/YYMMDD-...-plan.md
  - Task 1: ...
  - Task 2: ...
Ticket to create: DEV-XX "<title>" [default fields]
```
> "이 계획으로 무인 실행할까요?"
> - go — 티켓 생성 + orch 위임 (무인 실행 시작)
> - adjust — plan/tier 수정 후 다시 확인
> - cancel — worktree 정리 후 중단

- **go** → create ticket (A2 deferred creation if not yet made), proceed to Phase B.
- **adjust** → edit plan or tier, re-present this gate.
- **cancel** → `git worktree remove --force <worktree>`, stop.

---

## Phase B — orch Dispatch (unattended)

Construct the ralph-loop command and dispatch it into the worktree via `orch`. The main session
does NOT run the loop (ralph-loop's Stop-hook would hijack it). Main session stays free.

**Ralph prompt** (substitute real `<plan-file>`, `<N>`; append the personal-mode line only in
personal mode):

```
/ralph-loop:ralph-loop "Use superpowers:test-driven-development for each task
(test → RED [fails for the right reason] → minimal implement → GREEN → refactor). Read the full
plan at docs/plans/<plan-file>.md. When all tasks are implemented and the full test suite is green,
run the code review and Pre-PR checks below, then commit (exclude docs/plans/), then create the PR.

Completeness (before commit): run sc:reflect — implementation vs the plan (and the design.md if
present). Implement any missing requirements before proceeding.

Code review (before commit): run superpowers:requesting-code-review (or the code-reviewer subagent)
against the plan. Fix all Critical/Important issues. Do not create the PR until none remain.

Pre-PR checks (all required — do not assume pass, show output):
1. New env vars: git diff main...HEAD -- | grep '^+' | grep -E 'os\.environ\.get|os\.getenv|process\.env\.' | grep -v '^+++' — log any found.
2. Server boots: pf-server-django → 'source venv/bin/activate && cd web && python manage.py runserver' (Ctrl+C after boot); CDK → 'cdk synth'; Zappa/Lambda Django → 'PYENV_VERSION=<env> python manage.py runserver --settings=<app>.settings.local'; else project-specific.
3. Full test suite runs green (show pass/fail). If no runner: state 'no tests — skipped', do not silently pass.

PR: gh pr create --assignee @me, title '[DEV-XXXX] type: 간결한 설명', body with Summary/Changes/Test Plan/Jira (work) or Summary/Changes/Notes (personal).
[personal only] After PR: update the Notion page PR property with the PR URL." \
  --completion-promise "All plan tasks implemented via TDD, full test suite green, spec completeness verified via sc:reflect (no missing requirements), code review passed (no Critical/Important issues remaining), Pre-PR checks pass with output shown, changes committed excluding docs/plans, PR created and assigned to @me" \
  --max-iterations <N>
```

**Dispatch:**
```bash
ORCH_STUCK_SECS=7200 orch start --max <parallel>   # only if daemon not running; high stuck-timeout
orch add <worktree-absolute-path> "<full ralph-loop command above>"
```
- Substitute the real absolute worktree path (no generic prompt).
- **Main session is now free.** Announce:
  > "orch에 위임했습니다 (worktree `<path>`). `orch ls`로 진행 확인. 완료되면 PR이 GitHub에
  > 생성됩니다 — 리뷰는 편할 때 하시면 됩니다. 다른 작업을 바로 시작하셔도 됩니다."
- Do NOT talk to the orch session. Its only output is the worktree commit + PR.

---

## GATE 2 — PR Review (async) + ticket refine

The loop created the PR. Review is asynchronous — no session waiting.

- Review the PR diff on GitHub. Merge = human call. (Kickoff gate already approved the plan; PR
  review is the second safety net before production.)
- **After merge**, one non-blocking prompt:
  > "티켓 DEV-XX 기본값으로 생성됨. 지금 조정할까요?"
  > - 조정 — Priority / Story Points / Labels / Parent를 실제 값으로 수정
  > - 생략 — 기본값 유지

This is the ONLY place ticket fields get asked — post-facto, non-blocking (point 4).

**Worktree cleanup** (after PR merged, main session):
```bash
git -C <worktree> status --porcelain   # must be empty (loop committed everything)
git worktree remove --force <worktree>  # --force: docs/plans + venv symlink are untracked
# fallback: rm -rf <worktree> && git worktree prune
```

---

## Enforcement Rules

- **Only Gate 1 is synchronous.** No AskUserQuestion anywhere in Phase A. No exec-method choice
  (always ralph-loop+TDD). No per-step "실행할까요?" prompts.
- **Pre-PR checks are completion-promise conditions**, not gates. The loop must show their output
  before it is allowed to create the PR — never assume pass, never silently skip.
- **orch, not in-session.** ralph-loop hijacks its host session via Stop-hook. Always dispatch
  detached so the main session stays free for parallel fan-out.
- **Worktree = worktree-first**, created right after parse (A3), before brainstorm/plan.
- **Scope Guard holds:** infra / non-PR deploys route to infra-workflow. Never loop those.
- **External skill transitions overridden:** brainstorming/writing-plans self-transitions are
  ignored; the next step is always this file's phase order.

## Entry Points

1. `parse:slack` / `parse:notion` / `parse:jira` completes → pick "dev-workflow"
2. Existing Jira/Notion ticket URL provided → A1 detects it, A2 reuses it
3. `superpowers:systematic-debugging` root cause found → A4 brainstorm for solution
4. User directly requests a feature/fix
