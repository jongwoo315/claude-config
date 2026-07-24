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

Env-bound tickets (eval·측정·라이브 API 키·특수 인터프리터·소스 재빌드 = 헤드리스 loop가 못 닿는
env) → **driver mode**: 여전히 orch 세션으로 dispatch한다 — 단 ralph loop 없이 single-step으로
spawn (`orch add`, skip-perms). daemon은 컨텍스트만 seed하고 hand off → 사용자가 `tmux attach`로 붙어
env-bound 단계를 직접 구동한다. loopable과 차이는 **orch 세션의 mode(누가 advance하냐)뿐**이고,
main 세션은 두 경우 모두 dispatcher로만 남는다 (ticket 작업을 절대 실행하지 않음).

**Invariant: main = 순수 dispatcher.** 어느 모드든 실행은 orch 세션에서. Loop-ability는 그 orch
세션이 headless ralph loop이냐(loopable) 사용자가 붙어 구동하냐(driver)를 결정할 뿐, 실행 위치가
아니다. Driver ≠ "main 세션 self-drive" (구 규칙 폐기).

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
- **Worktree location: `~/plab/.wt/<repo>-<branch-suffix>`** (central parking lot, NOT a repo
  sibling). e.g. plab repo `pf-policy-bot` + branch `feature/DEV-7032-x` → `~/plab/.wt/pf-policy-bot-DEV-7032`.
  ```bash
  REPO_ROOT=$(git rev-parse --show-toplevel); REPO=$(basename "$REPO_ROOT")
  WT="$HOME/plab/.wt/${REPO}-${BRANCH_NAME##*/DEV-}"   # fallback: ${REPO}-$(echo "$BRANCH_NAME" | tr / -)
  mkdir -p "$HOME/plab/.wt"
  git -C "$REPO_ROOT" worktree add "$WT" "$BRANCH_NAME"   # no -b, existing branch
  ```
  `~/plab/.wt/` is under `~/plab/`, so mode/account/email rules already resolve to work/kimwoz/
  plabfootball — no special identity handling needed.
- `superpowers:using-git-worktrees` from the **existing** branch (used only for its add mechanics —
  location is overridden above).
- **Skip the "Verify Clean Baseline" test step** of using-git-worktrees.
- Symlink venv/.env so the detached loop can boot the server for Pre-PR checks.
  Detect the env flavor per `~/.claude/rules/python-env.md` — symlink whichever of
  `venv/.venv/env` exists; pyenv (`.python-version`) is git-tracked so needs no symlink:
  ```bash
  REPO_ROOT=$(git rev-parse --show-toplevel)
  for v in venv .venv env; do
    [ -d "$REPO_ROOT/$v" ] && ln -s "$REPO_ROOT/$v" "<worktree>/$v" && break
  done
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
  (`YYMMDD` prefix, NOT `YYYY-MM-DD`). Because Phase B's ralph prompt is only a short pointer to
  this file, **all execution detail must live in the plan**: TDD task breakdown, a **Pre-PR checks**
  section (embed the canonical block from Phase B verbatim), a **Done criteria** section, and the
  PR-creation step (personal mode: include the "update Notion PR property" step). Plan header
  directive MUST be:
  ```markdown
  > **For Claude:** This plan is executed via /ralph-loop:ralph-loop in a detached orch session.
  > You are ALREADY in the worktree, checked out on the feature branch. Do NOT switch branches,
  > create another worktree, or use AskUserQuestion / any interactive prompt — the session is
  > headless and cannot receive input, so always take the autonomous (recommended) default and
  > keep working. Do NOT use superpowers:executing-plans or subagent-driven-development.
  > Emit `<promise>RALPH_DONE</promise>` ONLY when every Done-criteria item and every Pre-PR check
  > is genuinely true AND the PR has been created — never to escape the loop.
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

## Phase B — orch Dispatch

Both modes dispatch to a detached orch session — **main stays free either way**. The Scope-Guard
tier already decided loopable vs driver:
- **loopable** (headless-reachable env) → ralph-loop, daemon advances headless. Sections below.
- **driver** (env-bound) → single-step spawn, user attends. See "Driver variant" before GATE 2.

### Loopable dispatch (unattended)

Construct the ralph-loop command and dispatch it into the worktree via `orch`. The main session
does NOT run the loop (ralph-loop's Stop-hook would hijack it). Main session stays free.

**`<N>` (max-iterations) by Tier** — no guessing: Tier A → 15, Tier B → 30, Tier C → 50.
(The A4 tier already decided; reuse it. Bigger tier = more tasks + more TDD cycles.)

**Ralph prompt — MUST be quote-safe (one plain line).** The ralph-loop slash command runs
`setup.sh $ARGUMENTS` inside a shell code-fence, so ANY quote, apostrophe, newline, or shell
metachar (`; & | $ ( ) < > "` `'`) in the args breaks tokenization (`(eval): unmatched "`, seen
twice in real runs). So the inline prompt is ONE short line of **plain words only** — all real
detail already lives in the plan file (A4) — and the completion promise is a **single bare token**
(no spaces → needs no quotes). Substitute `<plan-file>` and `<N>` (Tier A→15, B→30, C→50):

```
/ralph-loop:ralph-loop Read docs/plans/<plan-file>.md and implement it fully using TDD. You are already in the worktree on the feature branch, so never switch branches, never create a worktree, and never use AskUserQuestion — take the autonomous default and keep working. Open a PR when the plan Done criteria and Pre-PR checks all pass. --completion-promise RALPH_DONE --max-iterations <N>
```

Line rules: no quotes, no apostrophes, no `; & | $ ( ) < >`, no newlines. The plan header directive
(A4) carries the promise-emission condition and the no-AskUserQuestion / no-branch-switch guard.

**Canonical Pre-PR block — A4 embeds THIS verbatim into the plan's "Pre-PR checks" section**
(it is plan content, NOT part of the ralph prompt):
> Pre-PR checks (all required — do not assume pass, show output):
> 1. New env vars: `git diff main...HEAD` added lines matching `os\.environ\.get|os\.getenv|process\.env\.` — log any found.
> 2. Server boots — detached-safe, NO interactive Ctrl+C (no TTY in orch). Background + timeout + curl the port + kill. Never bare `runserver` (hangs the loop till ORCH_STUCK_SECS). Django → `source <venv>/bin/activate && cd web && (timeout 20 python manage.py runserver 127.0.0.1:8000 --noreload &) ; sleep 8; curl -sf http://127.0.0.1:8000/ -o /dev/null && echo BOOT_OK ; pkill -f runserver`; CDK → `cdk synth` (no server); Zappa/Lambda Django → same background+timeout with `PYENV_VERSION=<env> --settings=<app>.settings.local`; CLI/library → smoke-run the entrypoint (it must self-terminate); else project-specific.
> 3. Full test suite green (show pass/fail). If no runner: state `no tests — skipped`, do not silently pass.
> Then: completeness via `sc:reflect` vs plan; code review via `superpowers:requesting-code-review` (fix all Critical/Important); commit excluding `docs/plans/`; PR via `gh pr create --assignee @me` (work title `[DEV-XXXX] type: 설명` + Summary/Changes/Test Plan/Jira; personal title + Summary/Changes/Notes, then update the Notion PR property).

**Dispatch (into the A3 worktree — session starts already on the branch, so no checkout needed):**
```bash
ORCH_STUCK_SECS=7200 orch start --max <parallel>   # only if daemon not running; high stuck-timeout
orch add <worktree-absolute-path> "<the single quote-safe ralph line above>"
```
- Confirm the orch session did NOT stall on an interactive prompt: `orch logs <id>` should show work,
  not a menu. If it stalls despite the guard, the plan directive is missing the no-AskUserQuestion
  line — fix the plan, not the running session.
- Substitute the real absolute worktree path (no generic prompt).
- **Main session is now free.** Announce:
  > "orch에 위임했습니다 (worktree `<path>`). `orch ls`로 진행 확인. 완료되면 PR이 GitHub에
  > 생성됩니다 — 리뷰는 편할 때 하시면 됩니다. 다른 작업을 바로 시작하셔도 됩니다."
- Do NOT talk to the orch session. Its only output is the worktree commit + PR.

---

## Phase B (driver variant) — env-bound, attended-autonomous

Same worktree (A3), same kickoff gate — **only the dispatch changes**. No ralph loop wrapper, but
the session still runs **autonomously to PR using TDD** — the human attaches only to watch or
intervene, not because the session stops and waits. Single seed, no daemon re-kick.

```bash
ORCH_STUCK_SECS=7200 orch start --max <parallel>   # only if daemon not running
orch add <worktree-absolute-path> "Read docs/plans/<plan-file>.md and implement it fully using TDD. You are in the worktree on the feature branch, so never switch branches or create a worktree. Skip-perms is on and the live API key is in the worktree env, so run the live steps (embed / measurement / eval) yourself. Open a PR when the plan Done criteria and Pre-PR checks all pass. Use AskUserQuestion only if genuinely blocked."
```

- **`orch add`, NOT `orch pipe`.** Single step only — this is one continuous session, not a
  daemon-advanced pipeline. No auto-advance to collide with a human who attaches mid-run.
- **skip-perms (default `orch add`), NOT `--safe`.** The session runs autonomously; permission
  prompts only stall it. Claude still asks (AskUserQuestion) for genuinely important calls, so
  read/command prompts skipping is the intended trade. (Reversed from the earlier `--safe` rule at
  the user's request.)
- **TDD, drives to PR — same as loopable.** The difference from loopable is ONLY the execution
  engine: driver is a plain single Claude session (can AskUserQuestion when blocked, human can
  attach to intervene), loopable is a headless ralph loop (Stop-hook re-kick, RALPH_DONE promise,
  never interactive). Driver is for env-bound work the headless loop can't reach; both TDD to PR.
- **Seed delivery can be swallowed by a heavy startup banner** (spawn.sh readiness race — the
  welcome/NOTICE screen eats early keystrokes, and submit_step can't tell a swallowed seed from a
  submitted one). If the attached session shows an empty `❯` with no seed, resend it once via
  `tmux send-keys -t <sess> -- "<seed>"; tmux send-keys -t <sess> C-m` — dispatch action, not ticket
  work. So **always announce the seed text** too, so the user can paste it as fallback.
- **Announce the session (attach is optional — watching/intervening, not required):**
  > "driver 티켓 → orch 세션 `<sess>` spawn됨. TDD로 PR까지 자율 진행합니다. 지켜보거나 개입하려면
  > `tmux attach -t <sess>`. main 세션은 계속 dispatcher로 free입니다."
- Main is NOT involved past dispatch — it stays free for sibling dispatches.

---

## GATE 2 — PR Review (async) + ticket refine

The loop created the PR. Review is asynchronous — no session waiting.

- Review the PR diff on GitHub. Merge = human call. (Kickoff gate already approved the plan; PR
  review is the second safety net before production.)
- **Verify the loop's Pre-PR output, not just the diff.** Pre-PR checks are a completion-*promise*,
  not a hard gate — nothing forced the loop to prove them. Before merge, confirm in the PR/CI that
  the test suite actually ran green and the server boot printed `BOOT_OK` (or the check was
  legitimately N/A). A promise the loop can fib is only as good as this read.
- **Ticket refine — triggered by orch completion, NOT by merge.** Merge is done by CodePipeline /
  teammates, so no session ever catches a merge event; anchoring refine to merge means it never
  fires. Instead: when **orch notifies this task done** (loop finished + PR created), fire one
  non-blocking prompt in the notified session:
  > "티켓 DEV-XX 기본값으로 생성됨. PR `<url>` 올라왔습니다. 지금 조정할까요?"
  > - 조정 — Priority / Story Points / Labels / Parent를 실제 값으로 수정
  > - 생략 — 기본값 유지
  If the orch-completion notification is missed (session gone), the fields keep their A2 defaults —
  acceptable, refine is best-effort.

This is the ONLY place ticket fields get asked — post-facto, non-blocking (point 4).

**Worktree cleanup — manual, user-initiated. Do NOT auto-remove on merge.** Keep the worktree
live until the PR is fully closed: review feedback often needs follow-up commits pushed to the
same branch, and reusing the existing worktree avoids re-setup (venv symlink, deps). Remove only
when the user explicitly says so:
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
  detached so the main session stays free for parallel fan-out. NEVER arm the loop in a directory
  the main session shares as cwd — the Stop-hook is cwd-scoped and will hijack the main session too
  (observed: main session captured, fed the build task). The A3 worktree is a separate path, which
  is exactly why dispatch targets it.
- **Quote-safe ralph line.** The slash command shell-evals `$ARGUMENTS`; the dispatched line is ONE
  plain-word line with a single-token `--completion-promise`, no quotes/apostrophes/metachars/newlines.
  All detail lives in the plan. A quoted multi-line prompt = `unmatched "` and a dead loop.
- **Autonomous execution session (loopable only).** A loopable orch session is headless — it CANNOT
  answer AskUserQuestion. The plan header directive forbids interactive prompts and branch switches
  (it starts in the worktree already on the branch). A stalled menu in `orch logs` means the guard is
  missing from the plan — fix the plan and re-dispatch, do not hand-drive the session through tmux.
  (Driver sessions are the opposite: user-attended by design, dispatched single-step so no daemon
  advance collides with the manual work.)
- **Worktree = worktree-first**, created right after parse (A3), before brainstorm/plan.
- **Scope Guard holds:** infra / non-PR deploys route to infra-workflow. Never loop those.
- **Main = pure dispatcher, always.** Every ticket dispatches to its own orch session — loopable as a
  headless ralph loop, driver as a single-step user-attended session. Main runs ticket work in
  NEITHER mode. Never collapse a batch into main-session hand-execution; a prior 반자동 approval is
  single-ticket-scoped, never blanket.
- **External skill transitions overridden:** brainstorming/writing-plans self-transitions are
  ignored; the next step is always this file's phase order.

## Entry Points

1. `parse:slack` / `parse:notion` / `parse:jira` completes → pick "dev-workflow"
2. Existing Jira/Notion ticket URL provided → A1 detects it, A2 reuses it
3. `superpowers:systematic-debugging` root cause found → A4 brainstorm for solution
4. User directly requests a feature/fix
