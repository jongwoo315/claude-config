# orch — tmux Claude orchestrator

An automation layer on top of the [`tmux-claude-session-manager`](https://github.com/craftzdog/tmux-claude-session-manager) plugin. You queue tasks; `orch` auto-spawns `claude-orch-*` tmux sessions to work them (concurrency-capped), and auto-advances pipeline steps by watching the plugin's `@claude_state`. The plugin's picker (`prefix+u`) is still the manual view of your Claude sessions — orch is the automatic hand that opens and drives them for you.

## Dependency

orch reads the `@claude_state` / `@claude_state_at` tmux options that are stamped by the plugin's Claude Code hooks. **Those hooks MUST be installed** (follow the plugin README). Without them orch can't detect when a step finishes and pipelines will never advance.

## Commands

| Command | What it does |
| --- | --- |
| `orch add <dir> <prompt>` | Queue a single task |
| `orch pipe <dir> <step...>` | Queue a pipeline; steps are fed one-by-one as each turn finishes |
| `orch add --each <dir...> <prompt>` | Fan-out — one task per dir |
| `orch start [--max N]` | Start the daemon (default `--max 3` concurrent sessions) |
| `orch stop` | Stop the daemon (already-running sessions stay alive) |
| `orch ls` | Status table |
| `orch rm <id>` | Remove a queued task |
| `orch logs <id>` | Dump the task's session pane |

`--safe` (flag, anywhere in the args): this task asks permission instead of skip-perms.

## Permissions & safety

Tasks run with `--dangerously-skip-permissions` **by default** — that's the point, they run unattended.

> **WARNING:** Do not point orch at repos where an unreviewed `rm`, `git push`, or prod-affecting action could do real damage. For those, add `--safe` (the task will prompt instead of auto-approving) and keep `--max` low so you're never juggling more sessions than you can watch.

## How it advances

The daemon polls every ~3s (`ORCH_TICK`). A running task advances to its next step on a **debounced `working → idle` transition** of its session: orch waits for the `working → idle` edge, and the `idle` state must have been held for at least `ORCH_IDLE_DEBOUNCE` seconds (default 5) before it counts the step as complete and sends the next one.

## Failure handling

orch only detects **process-level** failure:

- the session died, or
- it's stuck in `working` longer than `ORCH_STUCK_SECS` (default 1200s / 20 min).

On either, the task is marked `failed` and you're notified (tmux message + terminal bell). orch does **not** judge whether the task actually succeeded — verify results yourself, or queue a follow-up task to check.

## Config (env vars)

| Var | Default | Meaning |
| --- | --- | --- |
| `ORCH_MAX` | `3` | Max concurrent sessions |
| `ORCH_TICK` | `3` | Daemon poll interval (s) |
| `ORCH_IDLE_DEBOUNCE` | `5` | Idle must hold this long (s) before advancing |
| `ORCH_STUCK_SECS` | `1200` | `working` longer than this → `failed` |
| `ORCH_CLAUDE_CMD` | `claude` | Launch command (tests override with `cat`) |

## Notes

- Completed sessions are left alive — inspect their results, then kill them via the picker (`ctrl-x`).
