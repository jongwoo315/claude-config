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
  # setup skill: personal-setup-work ; tracker: Notion (#NN) ; github: jongwoo315
else
  MODE=work
  # setup skill: setup-work ; tracker: Jira (DEV-XXXX) ; github: kimwoz
fi
```

**모드별 레이어 — 파이프라인·게이트·실행 모드는 동일하고 아래만 치환된다.**
권위는 `~/.claude/rules/dev-workflow.md`. 이 표와 어긋나면 rules가 이긴다.

| 레이어 | work (`~/plab`, `~/work`) | personal (`~/prv`) |
| --- | --- | --- |
| 티켓 ID | `DEV-XXXX` (Jira) | `#NN` — **prefix 없음.** `DEV-`는 Jira 형식이라 쓰면 로그에서 구분 불가 |
| 브랜치 | `feature/DEV-XXXX-<subject>` | `feat/<NN>-<subject>` (버그면 `fix/`) |
| worktree | `~/plab/.wt/DEV-XXXX-<subject>` | `~/prv/.wt/<NN>-<subject>` |
| GitHub 계정 | `kimwoz` | `jongwoo315` |
| PR 승인 | 리뷰어 approve | 1인 레포라 self-approve 불가 → `--comment` / `--request-changes` |
| 티켓 필드 | Jira Priority/SP/Labels/Parent | Notion `상태`·`작업일`·`Git 저장소`·`Git 브랜치`·`PR` |

⚠️ **worktree를 모드에 맞는 주차장에 만들 것.** `~/prv` 프로젝트를 `~/plab/.wt/`에 두면
디렉터리 기반 계정 규칙이 `kimwoz`로 해석돼 개인 레포 접근이 404로 실패한다 (실제 발생함).

## Scope Guard

dev-workflow = **PR-shipping code only.** Infra / DB migration-only / console-direct deploys
(Lambda deployed by CLI, not PR) → route to `infra-workflow` + `infra-safety-gate`. Do NOT run
the autonomous loop on irreversible non-PR deploys.

**Single execution mode: orch detached ralph-loop for every ticket. No exceptions.** There is no
separate driver/attended/env-bound mode (collapsed — the old distinction earned nothing: the human
only judges the PR, never intervenes mid-run). Live-key / measurement tickets run headless too —
symlink the key into the worktree env (.env) and the ralph session does embed/eval/measurement
itself.

**Invariant: main = 순수 dispatcher.** 실행은 항상 orch 세션(ralph loop)에서. main은 ticket 작업을
절대 실행하지 않는다.

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
  `상태`=진행 중, `작업일.start`=오늘, `Git 저장소`, `Git 브랜치`까지 채운다. **컬럼을 비워두지 않는다** —
  `PR`만 Phase B에서 채워진다. (`작업일`은 date range: 머지 후 `end` 추가 시 `start`를 함께 보내야 안 지워진다.)
- Branch: work `feature/DEV-XXXX-<subject>` · **personal `feat/<NN>-<subject>`** (버그면 `fix/`).
  티켓이 없으면 `feature/<topic>` / `feat/<topic>`.
- **Announce** the defaults used (text, not a question).

### A3. Worktree (worktree-first)
- **Worktree location — 모드별 주차장** (central parking lot, NOT a repo sibling):
  work `~/plab/.wt/DEV-XXXX-<subject>` · **personal `~/prv/.wt/<NN>-<subject>`**.
  The dir name is the branch suffix VERBATIM — no repo prefix. e.g. branch
  `feature/DEV-7032-hybrid-search` → `~/plab/.wt/DEV-7032-hybrid-search`.
  ```bash
  REPO_ROOT=$(git rev-parse --show-toplevel)
  # 모드에 맞는 주차장 — ~/prv 프로젝트를 ~/plab/.wt/ 에 두면 계정 규칙이 kimwoz로
  # 해석돼 개인 레포 접근이 404로 실패한다 (실제 발생함).
  case "$PWD" in "$HOME/prv/"*) PARK="$HOME/prv/.wt" ;; *) PARK="$HOME/plab/.wt" ;; esac
  WT="$PARK/${BRANCH_NAME##*/}"   # feat/104-db-schema -> 104-db-schema
  mkdir -p "$PARK"
  git -C "$REPO_ROOT" worktree add "$WT" "$BRANCH_NAME"   # no -b, existing branch
  ```
  **This name is the single source of truth for the whole chain** — orch derives its task id from
  the dir basename, the tmux session is `claude-orch-<id>`, and claude's `--name` is `<id>`. So a
  repo-prefixed dir (`pf-policy-bot-DEV-7133`) desyncs every downstream label. Ticket keys are
  unique org-wide, so dropping the repo prefix cannot collide.
  주차장이 프로젝트와 같은 트리 아래 있어야 mode/계정/이메일 규칙이 자동으로 맞게 해석된다
  (`~/plab/` → work/kimwoz/plabfootball, `~/prv/` → personal/jongwoo315/jongwoo315@gmail.com).
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
- **Brainstorm** — `superpowers:brainstorming` for Tier B/C → `docs/plans/MMDD-design-<short-topic>.md`.
  **Skip for Tier A.** Ignore brainstorming's own "→ writing-plans" transition; plan is A4's job.
- **Explore** — `dispatching-parallel-agents` (`Task(subagent_type=Explore)`) **only if** Tier C or
  brainstorm flags unknowns. Focused scope per agent, structured output. Else skip.
- **Plan** — always `superpowers:writing-plans` → `docs/plans/<ID>-MMDD-plan-<short-topic>.md`
  (`<ID>` = `DEV-XXXX` 또는 `<NN>`. 날짜는 **`MMDD`**, **type이 topic보다 앞**.
  전체 규칙은 `rules/dev-workflow.md`의 `## docs/plans 파일 규칙`). Because Phase B's ralph prompt is only a short pointer to
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
  > On a HARD, retry-proof API error (OpenAI insufficient_quota, 401/403, exhausted billing), STOP —
  > do NOT emit RALPH_DONE, do NOT create a PR, do NOT spin retrying. It surfaces via the orch
  > completion notification; a human fixes billing. (Transient TPM 429 is different — pace and retry.)
  ```
  Header metadata: `**Tier:** [X]`, `**Jira:** DEV-XXXX` (or `**Notion:** #NN`).

---

## GATE 1 — Kickoff Approval (the one synchronous gate)

**AskUserQuestion:**
```
Tier: [X] — [one-line rationale]
Plan: docs/plans/<ID>-MMDD-plan-<topic>.md
  - Task 1: ...
  - Task 2: ...
Ticket to create: DEV-XXXX / #NN "<title>" [default fields]
```
> "이 계획으로 무인 실행할까요?"
> - go — 티켓 생성 + orch 위임 (무인 실행 시작)
> - adjust — plan/tier 수정 후 다시 확인
> - cancel — worktree 정리 후 중단

- **go** → create ticket (A2 deferred creation if not yet made), proceed to Phase B.
- **adjust** → edit plan or tier, re-present this gate.
- **cancel** → `git worktree remove --force <worktree>`, stop.

---

## Phase B — orch Dispatch (unattended ralph-loop)

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
> Then: completeness via `sc:reflect` vs plan; code review via `superpowers:requesting-code-review` (fix all Critical/Important); commit (설계 문서를 추적하는 repo면 `docs/plans/`도 포함 — repo 관행을 따를 것); PR via `gh pr create --assignee @me` (work title `[DEV-XXXX] type: 설명` + Summary/Changes/Test Plan/Jira; personal title + Summary/Changes/Notes, then update the Notion PR property); 마지막으로 방금 만든 PR에 `pr-review-toolkit:review-pr` 실행 — 지적사항은 추가 커밋으로 얹는다 (리뷰만 하고 GitHub에 코멘트는 게시하지 않는다; 게시가 필요하면 사람이 `ops:github-pr-review`를 돌린다).
>
> 내장 `/code-review`를 여기 쓰지 말 것. 품질은 더 낫지만(다각도 finder + 후보별 독립 검증 CONFIRMED/PLAUSIBLE/REFUTED + failure_scenario 강제) **사람이 직접 치는 커맨드라 available-skills에 없다** — 헤드리스 세션에서 확인함. ralph가 호출하면 없는 스킬을 찾다 끝난다.

**Dispatch (into the A3 worktree — session starts already on the branch, so no checkout needed):**
```bash
ORCH_STUCK_SECS=7200 orch start --max <parallel>   # only if daemon not running; high stuck-timeout
orch add <worktree-absolute-path> "<the single quote-safe ralph line above>"
```

⚠️ **orch daemon은 스크립트를 메모리에 물고 돈다 — 코드 수정이 재시작 없이는 반영되지 않는다.**
`~/.claude`를 sync했거나 `orch/lib/*.sh`가 바뀐 뒤 첫 dispatch 전에는 반드시:
```bash
orch stop && ORCH_STUCK_SECS=7200 orch start --max 3
```
**증상:** 태스크 status는 `running`인데 tmux 세션이 없고, `orch logs <id>`가
`can't find pane: <mangled-name>`을 뱉는다. 세션명이 어긋나 있으면(예: `104-db-schema-schema` —
옛 코드가 `${id##*-}`를 접미사로 덧붙임) 확정적으로 stale daemon이다. 확인:
```bash
jq -r '.session' ~/.claude/orch/queue/task-<id>.json   # id와 정확히 일치해야 함
```
**복구:** `orch rm <id>` → **고아 프로세스 확인(아래)** → `orch stop` → `orch start` → 재 dispatch.
(디스크의 `lib/spawn.sh`가 이미 고쳐져 있어도 실행 중 daemon은 옛 코드를 쓴다 — 실제 발생함.)

⚠️ **`orch rm`은 claude 프로세스를 죽이지 않는다.** 큐 항목과 tmux 세션만 정리한다. 세션이
사라져도 claude는 고아로 살아남아 같은 worktree에 계속 쓰므로, 그대로 재 dispatch하면
**한 worktree에 에이전트 2개**가 붙는다 (실제 발생 — 둘이 같은 DB에 pytest를 돌려 서로를 깨뜨린다).
재 dispatch 전 반드시:
```bash
ps aux | grep "claude --dangerously" | grep -v grep | awk '{print $2}' | while read p; do
  echo "$p  $(lsof -p $p -a -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)"
done   # worktree 경로와 정확히 일치하는 PID만 kill. main 세션은 repo 루트라 걸리지 않는다
```

**중단된 실행을 재개할 때는 plan에 `## RESUME` 섹션을 추가한다** — 이미 있는 산출물 목록 +
"덮어쓰지 말고 테스트로 검증하라, 파일 존재 ≠ 통과 기준 충족". 없으면 처음부터 다시 만들거나
파일만 보고 통과 처리한다.
- Confirm the orch session did NOT stall on an interactive prompt: `orch logs <id>` should show work,
  not a menu. If it stalls despite the guard, the plan directive is missing the no-AskUserQuestion
  line — fix the plan, not the running session.
- Substitute the real absolute worktree path (no generic prompt).
- **Main session is now free.** Announce:
  > "orch에 위임했습니다 (worktree `<path>`). `orch ls`로 진행 확인. 완료되면 PR이 GitHub에
  > 생성됩니다 — 리뷰는 편할 때 하시면 됩니다. 다른 작업을 바로 시작하셔도 됩니다."
- Do NOT talk to the orch session. Its only output is the worktree commit + PR.
- **Seed delivery can be swallowed by a heavy startup banner** (spawn.sh readiness race — the
  welcome/NOTICE screen eats early keystrokes, and submit_step can't tell a swallowed seed from a
  submitted one). If `orch logs <id>` shows an empty `❯` with the ralph line never sent, resend once
  via `tmux send-keys -t <sess> -- "<ralph line>"; tmux send-keys -t <sess> C-m` — a dispatch action,
  not ticket work.

---

## GATE 2 — PR Review (async) + ticket refine

The loop created the PR. Review is asynchronous — no session waiting.

⚠️ **PR이 떴다고 루프가 끝난 게 아니다.** 루프는 PR 생성 후에도 Pre-PR 단계의 자기 코드 리뷰를
돌려 지적사항을 추가 커밋으로 얹는다 (실측: PR 생성 후 8분 이상 계속 작업). **리뷰를 시작하기 전에**:

```bash
orch ls                                          # done 이어야 함. running 이면 대기
git -C <worktree> status --porcelain             # 비어야 함
git -C <worktree> log --oneline main..HEAD       # 커밋 수가 더 늘지 않는지
```

`running` 중에 리뷰하면 도중에 커밋이 얹혀 리뷰 대상이 어긋난다.

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
  > "티켓 <ID> 기본값으로 생성됨. PR `<url>` 올라왔습니다. 지금 조정할까요?"
  > - 조정 — work: Priority / Story Points / Labels / Parent · personal: `프로젝트` / `선행 작업`
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
- **Autonomous execution session.** The orch ralph session is headless — it CANNOT answer
  AskUserQuestion. The plan header directive forbids interactive prompts and branch switches (it
  starts in the worktree already on the branch). A stalled menu in `orch logs` means the guard is
  missing from the plan — fix the plan and re-dispatch, do not hand-drive the session through tmux.
- **Live-key / measurement tickets run headless too** — symlink the key into the worktree env; no
  separate attended mode. On a hard API error (insufficient_quota, 401) the plan directive makes the
  session stop WITHOUT emitting RALPH_DONE or a PR (no spin); TPM 429 self-heals via code pacing.
- **Worktree = worktree-first**, created right after parse (A3), before brainstorm/plan.
- **Scope Guard holds:** infra / non-PR deploys route to infra-workflow. Never loop those.
- **Main = pure dispatcher, always.** Every ticket dispatches to its own orch ralph session. Main
  runs ticket work in no case. Never collapse a batch into main-session hand-execution.
- **External skill transitions overridden:** brainstorming/writing-plans self-transitions are
  ignored; the next step is always this file's phase order.

## Entry Points

1. `parse:slack` / `parse:notion` / `parse:jira` completes → pick "dev-workflow"
2. Existing Jira/Notion ticket URL provided → A1 detects it, A2 reuses it
3. `superpowers:systematic-debugging` root cause found → A4 brainstorm for solution
4. User directly requests a feature/fix
