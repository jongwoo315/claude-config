---
name: debugging-workflow
description: Use when starting any debugging task — after parsing external input (Slack, Notion, Jira) reporting a bug/incident, or a direct bug-fix request. Autonomous investigation to root cause with one gate (fix-approach approval); code fixes hand off to dev-workflow. Triggers on bug reports, incidents, or explicit invocation.
---

# Debugging Workflow (Autonomous Investigation)

## Overview

Autonomous investigation pipeline: **input → root cause, one gate, then route.**
Investigation (reproduce → hypothesis → root cause) is read-only and reversible, so it runs
unattended. The one decision that matters — *how* to fix — is a single gate. Code fixes then
**hand off to `dev-workflow`** (its autonomous loop owns TDD → review → Pre-PR → PR); this skill
does not re-implement shipping.

**Design philosophy shared with:** `~/.claude/docs/plans/0709-design-autonomous-dev-workflow.md`
(same 2-gate model; here the first gate is fix-approach, not plan-kickoff).

**The gates (only synchronous human touches):**
1. **Fix approach** — root cause is summarized; user picks DB fix / config / rollback / feature
   flag / code fix / other. This is the fork that determines everything downstream.
2. **PR review** — async, GitHub. *Code-fix path only*, inherited from `dev-workflow`.
   Non-code fixes (DB/rollback/flag) have no PR.

Everything before Gate 1 — context detect, systematic-debugging Phase 1-3 — is unattended.

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

Investigation is always safe (read-only). The **fix** is where danger lives:
- **DB direct fix** (mutating prod data) and **infra rollback/param change** are irreversible,
  non-PR mutations → route through `infra-safety-gate` before executing. Never auto-apply.
- **Code fix** ships as a PR → hand to `dev-workflow` (reversible, reviewable).

Same principle as dev-workflow's Scope Guard: irreversible non-PR mutations get a gate, never a loop.

---

## Phase A — Investigation (autonomous, read-only, no gate)

Runs in the main session. No branch or ticket needed yet — investigation touches nothing.

### A1. Context detect
Auto-detect URLs from the input — no "source?" question:
- Jira URL → `parse:jira` (extract ticket key, e.g. DEV-3131, for reuse in Phase B)
- Notion URL → `parse:notion`
- Slack URL → `parse:slack`
- Multiple URLs → run multiple parsers. Each writes `docs/plans/*-input.md`.
- No URL → use the user's direct bug description.

Auto-detect existing `docs/plans/*-input.md` (today/yesterday) and fold it in.

### A2. Systematic debugging (Phase 1-3, unattended)
Invoke `superpowers:systematic-debugging` with the A1 context. Run Phase 1-3 explicitly,
**log each phase output** (do not silently pass):

- **Phase 1 — Root Cause Investigation:** trace error/stack, reproduction conditions, recent
  changes, data flow. Output: "error path + suspect points".
- **Phase 2 — Pattern Analysis:** compare against working similar code, list differences.
  Output: "normal vs broken diff".
- **Phase 3 — Hypothesis:** single root cause statement — "X is root cause because Y".
  Output: "root cause hypothesis".

systematic-debugging is **not skippable** — no fix is chosen without a root cause. Do NOT assume
"the fix is code" and jump ahead; Phase 3 always ends at Gate 1.

---

## GATE 1 — Fix Approach (the one synchronous gate)

Summarize the root cause, then **AskUserQuestion** (options ranked, recommended first):
```
Root cause: [one line]
Evidence: [phase 1-3 findings, brief]
```
> "근본 원인이 파악되었습니다. 어떻게 해결할까요?"
> - DB 직접 수정 (데이터 픽스) — 데이터 문제면 가장 빠름. `infra-safety-gate` 경유.
> - 코드 수정 — 코드 버그거나 데이터 픽스로 불충분할 때. `dev-workflow`로 핸드오프.
> - 롤백 / 피처 플래그 / 설정 변경 — 즉시 완화. (직접 설명하면 세부 확인)
> - 기타 (직접 설명)

*(AskUserQuestion max 4 options — collapse rollback/flag/config into one; sub-confirm after.)*

---

## Phase B — Route by approach

### B-code → hand off to dev-workflow (autonomous)
The code-fix path IS a dev-workflow run. Do not duplicate its Steps.
1. Create the tracker item as **Bug** (default fields, no ask): work mode `setup-work` Issue Type
   `Bug`; personal mode `personal-setup-work`. Reuse the A1 ticket key if one exists.
2. Hand off:
   > "dev-workflow를 시작합니다. Issue Type=Bug, 브랜치 prefix=`fix/`.
   > 근본 원인 컨텍스트: [Phase 1-3 요약]. 재현 조건: [...]."
   dev-workflow's Phase A picks up from here (worktree from `fix/DEV-XXXX-<topic>`, plan seeded with
   the root cause + a **reproduction-test-first** directive, then orch-dispatched autonomous loop).
3. **GATE 2 (PR review)** is dev-workflow's async gate. This skill ends at handoff.

The reproduction test is mandatory in the seeded plan: TDD RED must be the failing repro, so the
loop proves the bug before fixing it.

### B-DB → infra-safety-gate, then verify + optional deeper dig
1. Present the fix SQL. Route through `infra-safety-gate` (identity check + confirm + rollback note)
   before executing — this is a prod mutation, never auto-apply.
2. Apply, confirm resolved.
3. **Autonomous 2차 조사 (offer, non-blocking):**
   > "해결됐습니다. '왜 이 데이터가 없었는가'를 조사할까요?"
   > - 예 → re-enter Phase A with "why was this data missing" as the new question. If a missing/buggy
   >   generation path is found → that becomes a **code fix** → B-code (dev-workflow).
   > - 아니오 → done.

### B-rollback / flag / config → apply, verify, done
- Infra rollback / RDS param → `infra-safety-gate` first (irreversible).
- App feature flag / env config → apply, then `superpowers:verification-before-completion`.
- No PR unless it also needs a code change (then → B-code).

### B-other → guide + stop
Explain the manual steps, stop. No autonomous action.

---

## Enforcement Rules

- **Only Gate 1 is synchronous.** No AskUserQuestion in Phase A. Investigation runs unattended,
  logging each phase.
- **systematic-debugging is not skippable.** No fix without a root cause (Phase 1-3 always run).
- **Don't presume the fix is code.** Gate 1 always presents non-code options; proceed to B-code only
  on explicit "코드 수정".
- **Irreversible non-PR fixes gate, never loop.** DB/rollback/param → `infra-safety-gate`. Same
  Scope Guard principle as dev-workflow.
- **Code fixes delegate, don't re-implement.** dev-workflow owns TDD → review → Pre-PR → PR and its
  async PR gate. This skill hands off and ends.
- **Bug ticket / `fix/` branch.** Issue Type always Bug; branch prefix `fix/` — set by dev-workflow
  on the B-code path.

## Entry Points

1. `parse:jira` / `parse:slack` / `parse:notion` reports a bug/incident → pick "debugging-workflow"
2. Existing Bug ticket URL provided → A1 detects it, B-code reuses it
3. Direct bug-fix / incident request
