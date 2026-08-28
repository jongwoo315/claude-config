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
verification, commit, PR creation, and then an independent review pass (Phase C) — is unattended.
The loops run detached via `orch`, so the main session stays free to fan out more tasks in parallel.
머지된 뒤의 정리(워크트리·orch 세션·티켓)는 **Phase D**가 맡고, 이것도 게이트가 아니다 —
머지를 보는 세션이 없어서 트리거가 이벤트가 아니라 상태 확인이다.

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

**적용 범위: 모든 개발 작업.** `~/plab`·`~/work` 업무든 `~/prv` 개인 프로젝트든 예외 없다.
디렉터리에 따라 **레이어만 치환**하고 파이프라인·게이트·실행 모드는 동일하다.
**이 표가 정본이다.**

| 레이어 | work (`~/plab`, `~/work`) | personal (`~/prv`) |
| --- | --- | --- |
| 티켓 시스템 | Jira (`DEV-XXXX`) | Notion 프로젝트 진행 DB `29241e61-65c0-801f-9529-cabf8cad919b` (`#NN`) |
| 티켓 ID | `DEV-XXXX` | `#NN` — **prefix 없음.** `DEV-`는 Jira 형식이라 쓰면 로그에서 구분 불가 |
| 티켓 스킬 | `setup-work` | `personal-setup-work` |
| 브랜치 | `feature/DEV-XXXX-<subject>` | `feat/<NN>-<subject>` (버그면 `fix/`) |
| worktree | `~/plab/.wt/DEV-XXXX-<subject>` | `~/prv/.wt/<NN>-<subject>` |
| GitHub 계정 / 커밋 이메일 | `kimwoz` / `$PLAB_WORK_EMAIL` | `jongwoo315` / `jongwoo315@gmail.com` |
| PR 승인 | 리뷰어 approve | 1인 레포라 **self-review는 `--comment`만** — `--approve`·`--request-changes` 둘 다 GitHub이 거부한다 (`Can not request changes on your own pull request`). merge 차단 안전망이 없으므로 미해결 Critical은 사람이 기억해야 한다 |
| 티켓 필드 갱신 | Jira Priority/SP/Labels/Parent | Notion `상태`·`작업일`·`Git 저장소`·`Git 브랜치`·`PR` **전부** |

**실행 모드는 양쪽 동일 — orch detached ralph-loop, 예외 없음.** `~/prv`가 학습·포트폴리오
목적이라고 해서 대화형으로 내려오지 않는다. 과정 경험이 아니라 **검증 기준을 정하는 능력**이
산출물이기 때문이다 (`rules/portfolio-judgment.md`). 사람의 개입은 Kickoff(plan 승인)와
PR 리뷰 두 지점뿐이다.

**`~/prv`에서 plan이 오히려 더 중요해진다.** 통과 기준·이번에 안 하는 것·실패 징후가 plan에
없으면 ralph는 "동작하는 코드"만 만들고 끝난다. Kickoff 게이트에서 이 3줄을 반드시 확인할 것.

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

**같이 하는 것 — 머지된 워크트리 스윕 (Phase D catch-up).** 이 repo의 `git worktree list`를 훑어
브랜치의 PR이 `MERGED`인 것을 찾는다. 있으면 정리할지 한 번 묻고 지나간다. **막지 말 것** —
답이 없으면 그냥 새 티켓을 계속한다. 머지는 어느 세션도 못 보므로 이 스윕이 유일한 회수 경로다.

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
  전체 규칙은 이 파일 아래 `## docs/plans 파일 규칙`). Because Phase B's ralph prompt is only a short pointer to
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
  > A TRANSIENT error that stops being transient counts as HARD. If 429/529 keeps surfacing AND you
  > have produced no commit and no file change for 20 minutes, STOP the same way. Waiting and
  > spinning are indistinguishable in a headless loop — nobody is watching the screen, and the loop
  > re-submits the prompt after every failed turn, so a server-side outage burns the whole iteration
  > budget while the picker still reads `working`.
  ```
  Header metadata: `**Tier:** [X]`, `**Jira:** DEV-XXXX` (or `**Notion:** #NN`).

---

## GATE 1 — Kickoff Approval (the one synchronous gate)

This gate has **two beats**: prediction first, then approval. Prediction must come before the
plan's verification detail is discussed — see `rules/portfolio-judgment.md` §착수 전 예측.

### Beat 1 — 착수 전 예측 (plain message, NOT AskUserQuestion)

Emit the plan's step list and nothing else — no 통과 기준, no 실패 징후, no risk commentary.
Those are the answer.

```
<ID> <제목>
plan 단계
  1 <단계 요약>
  2 ...

착수 전 예측 — 이 plan대로 짜면 어디가 깨질 것 같나? 3개. (건너뛰려면 `skip`)
```

Record the reply verbatim. Do **not** suggest candidates, rank them, or react to them — the
whole value of the metric is that the choosing is jw's. `skip` is a valid answer.

### Beat 2 — Approval

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

- **go** → append the Beat 1 answer to the plan file, commit it, create ticket
  (A2 deferred creation if not yet made), proceed to Phase B.

  ```markdown
  ## 착수 전 예측

  - 1. <키워드 + 한 줄>
  - 2. ...
  - 3. ...
  ```

  `skip`이면 `## 착수 전 예측\n\nskip` 한 줄. **빈 절로 두지 말 것.**
  Commit it before dispatch — the git timestamp is what makes the number un-fakeable, and the
  headless loop must not be the one writing this section.
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
> Then: completeness via `sc:reflect` vs plan; code review via `superpowers:requesting-code-review` (fix all Critical/Important); commit (설계 문서를 추적하는 repo면 `docs/plans/`도 포함 — repo 관행을 따를 것); PR via `gh pr create --assignee @me` (work title `[DEV-XXXX] type: 설명` + Summary/Changes/Test Plan/Jira; personal title + Summary/Changes/Notes, then update the Notion PR property). **PR을 만들면 이 루프는 끝난다** — 여기서 `pr-review-toolkit:review-pr`을 돌리지 말 것. 그 리뷰는 Phase C의 별도 세션이 맡는다. 여기서 돌리면 (a) 자기가 쓴 코드를 같은 컨텍스트가 리뷰하고 (b) PR 생성 후에도 커밋이 계속 얹혀 `orch ls`의 `done`이 완료를 뜻하지 않게 된다 (실측: PR 후 8분 이상 지속).
>
> 내장 `/code-review`를 여기 쓰지 말 것. 품질은 더 낫지만(다각도 finder + 후보별 독립 검증 CONFIRMED/PLAUSIBLE/REFUTED + failure_scenario 강제) **사람이 직접 치는 커맨드라 available-skills에 없다** — 헤드리스 세션에서 확인함. ralph가 호출하면 없는 스킬을 찾다 끝난다.
>
> 커밋 전 `superpowers:requesting-code-review`는 그대로 둔다 — 그건 커밋하기 전 자기 점검이고, Phase C는 커밋된 diff 전체를 새 컨텍스트가 다시 보는 것이라 겹치지 않는다.

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
**1순위는 워크트리가 더러운지다. 프로세스 검사가 아니다.**

```bash
git -C <worktree> status --porcelain          # 비어 있지 않으면 → 진행 금지
find <worktree> -newermt '-5 minutes' -not -path '*/.git/*' | head
```

**더러우면 프로세스가 안 보여도 진행하지 않는다.** 완료 조건은
`rules/judgment-log.md`의 `## 완료 신호`가 정의한 것이고, 루프는 `orch ls`가 `done`이 된
뒤에도 계속 커밋한다.

```bash
# 2순위 — 프로세스. 단 이건 있으면 증거지 없다고 무죄가 아니다
for p in $(pgrep -f '^claude'); do
  cwd=$(lsof -p "$p" -a -d cwd -Fn 2>/dev/null | grep '^n' | cut -c2-)
  case "$cwd" in */.wt/*) echo "$p  $cwd";; esac
done
tmux ls 2>/dev/null | grep claude-orch-
```

대상 worktree가 cwd인 PID가 있으면 **kill 후에 재 dispatch**한다.
`orch rm <id>` → 위 확인 → `kill <pid>` → `tmux kill-session -t claude-orch-<id>` → 재 dispatch.

> 자기 자신(main 세션)의 cwd가 repo 루트로 잡히니 **worktree 경로와 정확히 일치하는 것만** 죽일 것.

⚠️ **프로세스 검사는 한 번 봐서 "없음"이 나와도 없다는 뜻이 아니다.** 2026-08-20 DEV-7910에서
실측했다 — `orch ls`가 `done`, tmux 세션 없음, `pgrep`+`lsof`로 그 워크트리를 cwd로 잡은
프로세스 0건이었는데 **그 세션은 그 뒤 7분간 커밋 5개를 만들고 푸시했다.** 두 가지가 겹친다:

- ralph 루프는 **턴마다 `claude` 프로세스가 새로 뜬다.** 프로세스의 연속이라 턴 사이 빈틈에
  샘플링하면 0건이 나온다.
- 옛 명령 `ps aux | grep "claude --dangerously"`는 **첫 턴만 잡는다.** 그 뒤로는
  `claude --resume <uuid>`로 돈다. 같은 시각에 옛 명령 0건 / `pgrep -f '^claude'` 20건이었다.

**유일하게 신뢰할 수 있는 신호는 워크트리 상태다.**

**중단된 실행을 재개할 때는 plan에 `## RESUME` 섹션을 추가한다** — 이미 있는 산출물 목록 +
"덮어쓰지 말고 테스트로 검증하라, 파일 존재 ≠ 통과 기준 충족". 없으면 처음부터 다시 만들거나
파일만 보고 통과 처리한다.
- Confirm the orch session did NOT stall on an interactive prompt: `orch logs <id>` should show work,
  not a menu. If it stalls despite the guard, the plan directive is missing the no-AskUserQuestion
  line — fix the plan, not the running session.
- Substitute the real absolute worktree path (no generic prompt).
- **Main session is now free.** Announce:
  > "orch에 위임했습니다 (worktree `<path>`). `orch ls`로 진행 확인. 구현이 끝나 PR이 뜨면
  > 무인 리뷰 세션(`<ID>-review`)을 이어서 띄웁니다 — 그게 끝난 뒤에 보시면 됩니다.
  > 다른 작업을 바로 시작하셔도 됩니다."
- Do NOT talk to the orch session. Its only output is the worktree commit + PR.
- **Seed delivery can be swallowed by a heavy startup banner** (spawn.sh readiness race — the
  welcome/NOTICE screen eats early keystrokes, and submit_step can't tell a swallowed seed from a
  submitted one). If `orch logs <id>` shows an empty `❯` with the ralph line never sent, resend once
  via `tmux send-keys -t <sess> -- "<ralph line>"; tmux send-keys -t <sess> C-m` — a dispatch action,
  not ticket work.

---

## Phase C — Review Dispatch (두 번째 orch 세션)

구현 세션이 멈춘 것을 확인한 뒤, main이 **리뷰 전용 세션**을 같은 워크트리에 dispatch한다.
main은 dispatch만 하고 다시 free. 이 단계는 사람 게이트가 아니다.

**왜 별도 세션인가.** 구현 세션이 자기 코드를 리뷰하면 놓친 것을 또 놓친다 — Pre-PR 안의
`pr-review-toolkit:review-pr`이 이미 그렇게 돌고, 그 결과는 흔적 없이 추가 커밋으로만 남는다.
`orch pipe`도 답이 아니다: 다음 step을 **같은 tmux 세션에 밀어넣으므로**(`lib/spawn.sh`의
`submit_step`) 구현 컨텍스트를 그대로 물고 리뷰하게 된다. 새 `orch add`여야 컨텍스트가 새것이다.

### C1. 착수 조건 — 구현 세션이 정말 멈췄나

```bash
orch ls                                          # done 이어야 함. running 이면 대기
git -C <worktree> status --porcelain             # 비어야 함
git -C <worktree> log --oneline main..HEAD       # 커밋 수가 더 늘지 않는지
```

⚠️ **PR이 떴다고 루프가 끝난 게 아니다.** 루프는 PR 생성 후에도 자기 코드 리뷰를 돌려
지적사항을 추가 커밋으로 얹는다 (실측: PR 생성 후 8분 이상 계속 작업). 더러운 트리에
dispatch하면 한 워크트리에 에이전트 2개가 붙는다 — Phase B의 **고아 프로세스 확인**을 그대로
거칠 것. 전체 판정 기준은 `rules/judgment-log.md`의 `## 완료 신호`.

### C2. Dispatch

```bash
ORCH_TASK_ID="<ID>-review" orch add <워크트리 절대경로> "<아래 quote-safe 한 줄>"
```

`ORCH_TASK_ID`가 없으면 id 충돌 경로로 빠져 `<ID>-1`이 되고, 그 라벨은 이게 구현인지 리뷰인지
말해주지 않는다. 큐 파일·tmux 세션(`claude-orch-<ID>-review`)·picker 라벨이 전부 id를 미러하므로
이 하나로 체인 전체가 맞는다.

**리뷰 한 줄 — Phase B와 같은 quote-safe 규칙** (따옴표·아포스트로피·`; & | $ ( ) < >`·개행 금지,
completion-promise는 공백 없는 단일 토큰). 상세는 전부 지시 파일에 있다:

```
/ralph-loop:ralph-loop Read /Users/jw/.claude/skills/dev-workflow/review-prompt.md and follow it exactly for the open PR on this branch. You are already in the worktree on the feature branch, so never switch branches, never create a worktree, and never use AskUserQuestion. Never post anything to GitHub. --completion-promise REVIEW_DONE --max-iterations 15
```

### C3. 산출물

`docs/plans/<ID>-MMDD-review-<short-topic>.md` — 지적 표(심각도·위치·내용·처리)와 plan 대조 표.
Critical/Important는 **지적 하나당 커밋 하나**로 고쳐 push되고, 안 고친 것은 `push-back` /
`defer` / `won't-fix`로 이유가 남는다. **GitHub에는 아무것도 안 올라간다** — 게시는
`ops:github-pr-review`가 사람 확인을 받고 하는 일이다.

리뷰 세션이 `done`이 되면 다시 C1의 세 줄로 멈춤을 확인하고 GATE 2로 넘어간다.

---

## GATE 2 — PR Review (async) + ticket refine

Phase C가 끝났다. 사람이 판정할 차례 — 비동기, 세션이 기다리지 않는다.

- `docs/plans/<ID>-MMDD-review-<topic>.md`를 먼저 읽는다. 무인 리뷰가 무엇을 잡았고 무엇을
  `push-back`으로 넘겼는지가 여기 있다. **`push-back`·`won't-fix` 행이 사람이 볼 첫 자리다** —
  무인 세션이 "안 고치기로 한 것"이 유일하게 검토가 필요한 결정이다.
- Review the PR diff on GitHub. Merge = human call. (Kickoff gate already approved the plan; PR
  review is the second safety net before production.)
- **Verify the loop's Pre-PR output, not just the diff.** Pre-PR checks are a completion-*promise*,
  not a hard gate — nothing forced the loop to prove them. Before merge, confirm in the PR/CI that
  the test suite actually ran green and the server boot printed `BOOT_OK` (or the check was
  legitimately N/A). A promise the loop can fib is only as good as this read.
- **판단 로그 — plan의 통과 기준과 대조하고, 판정은 jw가 쓴다. 사실은 네가, 판단은 jw가.**
  **정본은 `rules/judgment-log.md`의 `## 판단 로그` 절** — 트리거·블록 형식·규칙이 전부 거기 있고,
  이 스킬을 호출하지 않아도 발동한다. 둘이 갈리면 rules를 따른다.
  **Fires on the STATE, not the notification** — whenever you have just established that a
  ticket's loop is `done` and its PR exists, in the main / dispatcher session. The orch
  completion notification is one path; running `orch ls` yourself (which the block above tells
  you to do) is another, and it was silently not covered — a manual `orch ls` + PR summary
  produced no log at all. Never in the orch ralph session, which is headless and already
  finished.

  Dedup on the PR number, not on how you got here: if `~/.claude/judgment-log.md` already has a
  row for that PR, skip. That is what makes a state trigger safe to re-enter.

  main is outside the worktree, so gather the
  facts yourself (`gh pr view`, `git -C <worktree> diff --stat main...HEAD`, the loop's Pre-PR
  output in the PR body). Emit the fact block FILLED and the judgment lines BLANK:

  **블록 형식과 사실/판단 분리 규칙은 여기 복제하지 않는다 — rules를 그대로 따른다.**
  복제하면 갈린다: 실제로 갈렸다. rules에 "plan 통과 기준·실패 징후와 대조" 블록과 CI 체크
  줄이 들어간 뒤에도 이 사본은 옛 6줄 블록을 들고 있었고, 그 사본만 읽은 세션은 이 티켓이
  **무엇을 달성했어야 하는지** 없이 판정하게 된다.

  파이프라인 문맥에서 추가로 지킬 것:
  - **Order: judgment prompt BEFORE ticket refine.** Judgment while the diff is fresh; refine is admin.
  - **Catch-up** — if main was gone when orch finished, that row is missing. On the next
    dev-workflow entry, list PRs created since the last logged row and offer a batch fill.
    **`--author @me` 쓰지 말 것** — `@me`는 `gh`의 *현재 활성 계정*으로 풀리는데 이 맥에는
    `jongwoo315`와 `kimwoz`가 둘 다 등록돼 있고 활성 계정은 작업 디렉터리와 무관하게 바뀐다.
    `~/prv`에서 활성이 `kimwoz`면 0건이 나오고 그게 "빠진 행 없음"으로 읽힌다 — 조용한 오답이다.
    `rules/github.md`의 디렉터리 규칙대로 계정을 명시한다:
    `gh pr list --author jongwoo315 --limit 20` (`~/prv`) / `--author kimwoz` (`~/plab`·`~/work`).
    Best-effort; never block on it.
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

**여기서 워크트리를 지우지 않는다.** PR이 열려 있는 동안은 살려 둔다 — 리뷰 피드백이 같은
브랜치에 후속 커밋을 요구하고, 기존 워크트리를 다시 쓰면 재설치(venv 심볼릭 링크, 의존성)가
없다. 정리는 머지된 뒤 **Phase D**가 한다.

---

## Phase D — 머지 후 정리 (워크트리 · orch · 티켓)

PR이 머지됐다. 남은 것은 정리뿐이고, 여기는 dispatcher 세션(main)에서 한다.

**트리거가 이벤트가 아닌 이유 — 머지를 보는 세션이 없다.** CodePipeline이나 동료가 누르고,
그때 이 파이프라인은 이미 끝나 있다. 그래서 트리거는 **상태 확인** 둘이다:

- jw가 말한다 — `<ID> 머지됐어` · `정리해`
- **catch-up 스윕** — 다음 dev-workflow 진입(A1) 때 `.wt/` 아래 워크트리를 훑어 PR이
  `MERGED`인 것을 찾는다. 있으면 정리 여부를 한 번 묻고 지나간다. best-effort, 막지 말 것.

### D1. 머지 확인 — 추측 금지

```bash
gh pr view <n> --json state,mergedAt,headRefName,mergeCommit
```

**`state`가 `MERGED`인 것만 정리한다.** `CLOSED`는 머지가 아니다 — 반려돼 다시 손볼 브랜치를
지우면 작업이 사라진다. 둘의 차이는 `mergedAt`이 `null`인지로도 갈린다.

### D2. 판단 로그가 비었으면 여기가 마지막 기회다

`~/.claude/judgment-log.md`에 그 PR 번호 행이 있나 본다. 없으면 **워크트리를 지우기 전에**
GATE 2의 판단 로그를 먼저 띄운다 (`rules/judgment-log.md`가 정본). 워크트리가 사라지면
`git -C <worktree> diff --stat`로 모으던 사실 줄을 못 채운다.

### D3. 워크트리

```bash
git -C <worktree> status --porcelain                    # 비어야 한다
git -C <worktree> log --oneline @{u}..HEAD              # 안 올라간 커밋 0이어야 한다
git worktree remove --force <worktree>                  # --force: docs/plans·venv 심볼릭 링크가 untracked
git worktree prune
# fallback: rm -rf <worktree> && git worktree prune
```

**둘 중 하나라도 비어 있지 않으면 멈추고 그 사실을 보고한다.** 지우지 말 것 — 커밋 안 된
변경이나 안 올라간 커밋은 머지된 PR에 없는 것이고, 워크트리가 유일한 사본이다.

### D4. orch 태스크와 tmux 세션

```bash
tmux kill-session -t claude-orch-<ID>        2>/dev/null
tmux kill-session -t claude-orch-<ID>-review 2>/dev/null
orch rm <ID>; orch rm <ID>-review
```

`orch rm`은 큐 파일만 지운다 — tmux 세션은 따로 죽여야 한다. **`orch clean`을 쓰지 말 것:**
`done` 태스크를 **전부** 지워서 아직 머지 안 된 다른 티켓의 행까지 날아간다. 티켓 단위 정리는
위 네 줄이다.

### D5. 티켓과 브랜치

| 곳 | 처리 |
| --- | --- |
| Notion (`~/prv`) | `상태`=완료, `작업일.end`=오늘. ⚠ `작업일`은 date range — 현재 `start`를 조회해 `{start, end}`로 PATCH (§티켓 프로퍼티) |
| Jira (`~/plab`·`~/work`) | transition → `Done`. A2에서 기본값으로 만든 필드가 아직 그대로면 여기서 같이 refine |
| 로컬 브랜치 | `git branch -d <branch>` — 머지됐으므로 `-d`로 지워진다. `-D`가 필요하면 안 머지된 것이니 멈춘다 |
| origin 브랜치 | 건드리지 않는다. GitHub의 auto-delete가 한다 |

정리 끝나면 한 줄로 보고한다 — `<ID> 정리 완료: 워크트리 · orch 2건 · 티켓 완료`.

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
- **일시 에러도 지속되면 하드로 친다.** 429·529가 계속 뜨면서 **20분간 커밋·파일 변경이 0이면
  하드 에러와 동일하게 중단**. 무인 루프에서는 기다리는 것과 스핀하는 것이 구분되지 않는다 —
  화면을 보는 사람이 없고, 루프는 실패한 턴 뒤에 프롬프트를 다시 밀어넣는다. 서버 과부하 하나가
  반복 예산을 통째로 태우는데 picker는 `working`으로 보인다 (2026-08-06 #89에서 24분 무진전,
  사람이 화면을 봐서야 발견). **이건 plan 텍스트일 뿐 강제 장치가 아니다** — 모델이 스스로
  시간을 재야 한다. 확실히 잡으려면 orch 데몬이 `@claude_state_at`과 워크트리 mtime으로 stuck
  판정을 해야 한다 (미구현).
- **Batch/parallel — 복수 티켓 병렬 요청**("all parallel", "run X,Y,Z")은 티켓별 독립 orch 세션
  dispatch가 **기본값**. 단일 main 세션 hand-execution으로 합치려면 **먼저 AskUserQuestion 확인**
  (조용히 합치기 금지). 티켓별 worktree 유지, main은 free로 남아 sibling 티켓 dispatch 계속.
- **Phase C는 별도 orch 세션이다.** 구현 세션에 리뷰를 얹지 말 것 — 자기 코드를 같은
  컨텍스트가 리뷰하면 놓친 것을 또 놓친다. `orch pipe`도 안 된다 (`submit_step`이 같은 tmux
  세션에 다음 step을 밀어넣는다). `ORCH_TASK_ID=<ID>-review orch add`로 새로 띄운다.
- **정리는 머지 뒤에만 (Phase D).** PR이 열려 있는 동안 워크트리를 지우지 않는다 — 리뷰 후속
  커밋이 같은 브랜치로 간다. 그리고 `CLOSED`는 머지가 아니다: `state == MERGED`를 확인하고 지운다.
  `orch clean`은 티켓 단위 정리에 쓰지 않는다 (다른 티켓의 `done` 행까지 지운다).
- **무인 세션은 GitHub에 게시하지 않는다.** 리뷰 결과도, 리뷰 코멘트도, approve/request-changes도.
  게시는 사람 확인을 받는 행위이고 그 자리는 `ops:github-pr-review`뿐이다.
- **External skill transitions overridden:** brainstorming/writing-plans self-transitions are
  ignored; the next step is always this file's phase order.

## 티켓 프로퍼티

### Jira (`~/plab`, `~/work`)

**이 파이프라인 안:** 질문 없이 **기본값으로 생성**, PR 머지 후 refine.
기본값 — Issue Type `Dev`, Parent `DEV-3637`, Labels `Backend`, Priority `Medium (3)`,
Story Points `3`. *(Parent + Labels는 placeholder — 상황 따라 refine.)*

**파이프라인 밖에서 단독 티켓 생성 시:** 아래 5개를 **AskUserQuestion으로 확인**.

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

### Notion (`~/prv`)

DB `29241e61-65c0-801f-9529-cabf8cad919b` (프로젝트 진행). Jira 대신 이쪽을 갱신한다.

| 시점 | 채울 컬럼 |
| ---- | --------- |
| 태스크 생성 | `태스크`, `프로젝트`, `상태`=시작 전, `Git 저장소`, `선행 작업` |
| **착수** | `상태`=진행 중, `작업일.start`=오늘, `Git 브랜치` |
| PR 생성 직후 | `PR` |
| 머지 후 | `상태`=완료, `작업일.end`=오늘 |

**컬럼을 비워두지 않는다.** 착수도 안 바꾸고 끝에 몰아서 완료 처리하지 않는다.

⚠️ **`작업일`은 date range다.** 머지 후 `end`를 넣을 때 기존 `start`를 같이 보내지 않으면
시작일이 지워진다. 반드시 현재 값을 조회한 뒤 `{start, end}` 형태로 PATCH할 것.

**Notion `ID`는 prefix가 없다** — `{"prefix": null, "number": 86}`. `#86`으로 표기하고
`DEV-86`으로 쓰지 않는다. `DEV-`는 Jira 티켓 형식이라 로그에서 둘을 구분할 수 없게 된다.

**실제 프로퍼티는 10개뿐이다:** `태스크`(title) · `상태`(select) · `프로젝트`(select) ·
`ID`(unique_id, 읽기 전용) · `작업일`(date range) · `Git 저장소`(url) · `Git 브랜치`(url) ·
`PR`(url) · `선행 작업`(relation) · `후속 작업`(relation). **`생성일`은 존재하지 않는다.**

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
| `review`       | 무인 리뷰 결과 + 처리 | Phase C 리뷰 세션        |

**예시:**

- `DEV-3384-0316-design-location-storage.md`
- `DEV-3531-0324-input-sensitive-data.md`
- `DEV-4833-0622-input-pw-verify.md`
- `0330-design-plabthon26-ideas.md` (티켓 없음)

**Rename 시점:** setup-work / personal-setup-work에서 티켓 ID가 확정된 후 (신규 생성 또는 기존 티켓 연결 모두 포함), `docs/plans/`의 관련 파일을 `DEV-XXXX-MMDD-<type>-<short-topic>.md`로 rename

**경로 참조:** Jira/Notion에 docs/plans 경로를 기록할 때 절대 경로 사용.

- `<repo-root>/docs/plans/...` (`repo-root` = `$(git rev-parse --show-toplevel)`)

## Entry Points

1. `parse:slack` / `parse:notion` / `parse:jira` completes → pick "dev-workflow"
2. Existing Jira/Notion ticket URL provided → A1 detects it, A2 reuses it
3. `superpowers:systematic-debugging` root cause found → A4 brainstorm for solution
4. User directly requests a feature/fix
