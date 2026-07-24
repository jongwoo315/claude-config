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
   flag / code fix / **investigate-only (record & hold — on-call default)** / other. This is the
   fork that determines everything downstream.
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

### A2. Investigation strategy (Claude auto-decides, no ask)
Pick serial vs parallel by heuristic — **announce the call + one-line reason, do not ask**
(Phase A has no AskUserQuestion). User can veto by interjecting; default is no question.

| Signal | Route |
|---|---|
| single clear error/stack → one file/func; obvious cause | **serial** (default) |
| Tier C, OR no repro yet, OR spans ≥2 systems/services, OR intermittent/flaky, OR Phase 1 yields >1 live hypothesis | **parallel fan-out** |

Fan-out is reversible (worst case: some wasted tokens) → Claude's call, not a gate. Only the
irreversible fix fork (Gate 1) stays with the user.

### A2b. Telemetry inventory — authoritative-source-first (do this BEFORE code spelunking)

List what observability exists and its **trust class**, then consume high-trust sources FIRST.
Guessing at code candidates or leaning on lagged/sampled data before exhausting complete logs is
the #1 time-sink (see Gotchas).

| Class | Meaning | Examples | Use |
|---|---|---|---|
| **complete** | every event, no sampling | ALB access logs (S3, Athena), CloudWatch app logs, DB audit/**binlog**, `django_admin_log` | source of truth — consume first |
| **sampled** | partial retention | Datadog APM traces/spans | strong but absence ≠ non-occurrence |
| **lagged** | delayed + merge-collapsed | BigQuery CDC / Datastream, read-replica | direction only; never treat absence as proof |

Rule: **prove or kill a hypothesis with a complete source before writing it down.** A finding from
a sampled/lagged source is a lead, not a conclusion. Enumerate the inventory explicitly in Phase A
output so gaps are visible (e.g. "no binlog access → exact writer may stay unproven").

### A3. Systematic debugging (Phase 1-3, unattended)
Invoke `superpowers:systematic-debugging` with the A1 context. Run Phase 1-3 explicitly,
**log each phase output** (do not silently pass):

- **Phase 1 — Root Cause Investigation:** trace error/stack, reproduction conditions, recent
  changes, data flow. Output: "error path + suspect points".
  - **Parallel path** (`dispatching-parallel-agents`, read-only agents, blind to each other —
    multi-modal sweep): agent A traces stack/error path; agent B `git blame` + recent changes on
    the suspect area; agent C compares vs working similar code (folds in Phase 2); agent D
    reproduces conditions + data-flow trace. Synthesize findings → single hypothesis.
- **Phase 2 — Pattern Analysis:** compare against working similar code, list differences.
  Output: "normal vs broken diff". *(Parallel path: covered by agent C above.)*
- **Phase 3 — Hypothesis:** single root cause statement — "X is root cause because Y".
  Serial or synthesized-from-fan-out, always converges to ONE hypothesis. Output: "root cause".

**Tag every finding** with `evidence-class` (**proven** = confirmed by a complete source /
reproduced · **strong-circumstantial** = fits but unconfirmed · **hypothesis** = unverified) and
one-line confidence. Banned until a complete source confirms: "물증 100%", "결정적 단서", or any
closure language. Overclaiming then walking it back costs more than hedging.

**Separate "what happened" from "who did it".** A proven *state transition* (e.g. row reverted
RELEASE→…→HIDE) is NOT the same as a proven *causal writer* (which code path wrote it). Phase 3
must say which of the two it has. If only the state transition is proven, the root cause is
**OPEN** — say so; do not let a well-evidenced symptom masquerade as a closed cause.

systematic-debugging is **not skippable** — no fix is chosen without a root cause. Do NOT assume
"the fix is code" and jump ahead; Phase 3 always ends at Gate 1.

**Hypotheses stay in scratch, not the durable doc.** Write only `proven` findings into
`docs/plans/*-input.md` / the tracker. Unverified guesses that must be recorded get an explicit
`(미검증)` label. Never seed a conclusion slot with a guess — it gets copied forward as fact.

---

## GATE 1 — Fix Approach (the one synchronous gate)

Summarize the root cause, then **AskUserQuestion** (options ranked, recommended first):
```
Root cause: [one line]  ·  evidence-class: [proven | OPEN — state proven, writer unproven]
Evidence: [phase 1-3 findings, brief]
```
If the causal writer is unproven (root cause **OPEN**), say so in the summary — the urgent fix
(DB/rollback) can still proceed to mitigate the symptom, but don't present it as a closed RCA.
> "근본 원인이 파악되었습니다. 어떻게 진행할까요?"
> - DB 직접 수정 (데이터 픽스) — 데이터 문제면 가장 빠름. `infra-safety-gate` 경유.
> - 코드 수정 — 코드 버그거나 데이터 픽스로 불충분할 때. `dev-workflow`로 핸드오프.
> - 롤백 / 피처 플래그 / 설정 변경 — 즉시 완화. (직접 설명하면 세부 확인)
> - 원인만 파악 / 보류 — 지금은 안 고침. 근본 원인 기록 후 종료 (기타는 직접 설명).

*(AskUserQuestion max 4 options — collapse rollback/flag/config into one; the 4th folds
investigate-only + catch-all. **On-call default is often this 4th** — 당직 중엔 원인 파악·기록·인계가
목표고 픽스는 정규 시간에. Recommended-first ordering depends on context: incident/on-call framing →
put "원인만 파악 / 보류" first.)*

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
2. Apply, confirm resolved. **Label state honestly:** "증상 완화됨 (symptom mitigated), RCA
   [완료 | 진행중/OPEN]." A data fix is not an RCA — if the causal writer is still OPEN, the tracker
   entry says so, and the 2차 조사 offer below is the path to close it.
3. **Autonomous 2차 조사 (offer, non-blocking):**
   > "해결됐습니다. '왜 이 데이터가 없었는가'를 조사할까요?"
   > - 예 → re-enter Phase A with "why was this data missing" as the new question. If a missing/buggy
   >   generation path is found → that becomes a **code fix** → B-code (dev-workflow).
   > - 아니오 → done.

### B-rollback / flag / config → apply, verify, done
- Infra rollback / RDS param → `infra-safety-gate` first (irreversible).
- App feature flag / env config → apply, then `superpowers:verification-before-completion`.
- No PR unless it also needs a code change (then → B-code).

### B-hold → 원인 기록 후 종료 (on-call default, 기타 포함)
픽스하지 않고 근본 원인만 남긴다 — 당직 중 트리아지의 정착점.
1. **근본 원인 기록** (no ask, autonomous): Phase 1-3 요약(root cause + evidence + 재현 조건)을
   추적 항목에 남긴다. A1에서 티켓 키가 잡혔으면 그 티켓에 코멘트, 없으면 tracker에 항목 생성만
   (Bug, 상태 = 조사됨/보류). work=Jira / personal=Notion, Mode Detection 규칙.
2. **인계 노트 한 줄**: "원인은 X. 픽스 보류 — [코드 / DB / 롤백 중 뭐가 유력한지]. 정규 시간 처리."
3. 픽스 없음 → PR 없음, 무인 액션 없음. 나중에 재개하면 이 기록으로 바로 Gate 1 복귀.

*"기타 (직접 설명)"*도 여기: 사용자가 설명한 수동 스텝을 안내하고 stop. No autonomous action.

---

## Enforcement Rules

- **Only Gate 1 is synchronous.** No AskUserQuestion in Phase A. Investigation runs unattended,
  logging each phase.
- **systematic-debugging is not skippable.** No fix without a root cause (Phase 1-3 always run).
- **Investigation strategy is Claude's call, announced not asked.** Serial vs parallel fan-out by
  the A2 heuristic — reversible, so no gate. User vetoes by interjecting.
- **Don't presume the fix is code.** Gate 1 always presents non-code options; proceed to B-code only
  on explicit "코드 수정".
- **Irreversible non-PR fixes gate, never loop.** DB/rollback/param → `infra-safety-gate`. Same
  Scope Guard principle as dev-workflow.
- **Code fixes delegate, don't re-implement.** dev-workflow owns TDD → review → Pre-PR → PR and its
  async PR gate. This skill hands off and ends.
- **Investigate-only records, never drops.** B-hold(원인만 파악)는 반드시 근본 원인을 tracker에
  남기고 종료 — 조용히 끝내지 않는다. On-call 재개 시 그 기록이 Gate 1 복귀점.
- **Authoritative-source-first (A2b).** Complete logs before sampled/lagged; prove or kill with a
  complete source before writing a finding down.
- **Findings carry evidence-class.** proven / strong-circumstantial / hypothesis + confidence. No
  closure language ("물증 100%", "결정적") until a complete source confirms.
- **State transition ≠ causal writer.** Don't close root cause on a proven symptom-state when the
  writer is unproven — mark it OPEN.
- **Durable doc = proven only.** Guesses stay in scratch or get an explicit `(미검증)` label; never
  seed a conclusion slot with a hypothesis.
- **Bug ticket / `fix/` branch.** Issue Type always Bug; branch prefix `fix/` — set by dev-workflow
  on the B-code path.

## Gotchas (evidence semantics)

- **BigQuery CDC / Datastream time-travel** = state of the **BQ table** at that wall-clock, lagging
  the source 15–20 min; sub-second source changes get merge-collapsed to one version. `AS OF` HIDE
  ≠ source was HIDE then, and a missing intermediate version ≠ it never happened. Direction only.
- **Read-replica** has replication lag; no per-row change history unless the table has audit
  columns. Confirm the real column set (`SHOW COLUMNS`) before assuming `updated_at` etc.
- **ALB access log** is complete but URL/method only — no request **body**. A write whose culprit
  detail lives in the body (which field was set) needs APM-with-body or binlog to prove.
- **Django `django_admin_log`** records change-**form** saves only; **changelist bulk actions**
  (custom admin actions) are NOT logged unless the action calls `log_change` itself.
- **Sampled APM absence ≠ non-occurrence.** A client-aborted/errored request may emit no span.
  Missing trace is not evidence the code didn't run.

## Entry Points

1. `parse:jira` / `parse:slack` / `parse:notion` reports a bug/incident → pick "debugging-workflow"
2. Existing Bug ticket URL provided → A1 detects it, B-code reuses it
3. Direct bug-fix / incident request
