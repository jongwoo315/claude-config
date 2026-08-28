# claude-config

Personal Claude Code configuration — global instructions, rules, hooks, skills, and tooling. This directory is itself the git repo ([`jongwoo315/claude-config`](https://github.com/jongwoo315/claude-config), public since 2026-07-29), synced across machines. Credentials live in `~/.zshenv` and are never committed.

## Layout

| Path | Purpose |
| --- | --- |
| `CLAUDE.md` | Global instructions loaded into every session |
| `rules/` | Domain rules (git, apis, databases, python-env, …) merged into context |
| `hooks/` | Session/tool lifecycle hooks |
| `skills/`, `commands/` | User-invocable skills and slash commands |
| `orch/` | tmux Claude orchestrator (see below) |
| `docs/plans/` | Design docs and implementation plans |
| `kimi-tools/` | Kimi K2 delegation CLIs (token saving) |

## What's measured here

Most of this repo is configuration. Three files are not — they hold measurements
that were run to settle a question, and they are kept mainly because each one
recorded a hypothesis being overturned.

| File | How it was measured | Result |
| --- | --- | --- |
| [`rules/korean-style.md`](rules/korean-style.md) | Same prompts run with and without the rule loaded; coined-term rate per 10k characters | 3.0 → 0.78. One term family went from 5 variants to 0. A full sweep of one repo found 194 occurrences across 7 terms. |
| [`RTK.md`](RTK.md) | Byte-for-byte diff of a token-saving CLI proxy's output against the raw command, per subcommand | Two subcommands saved **0%** — output was byte-identical up to 1.38MB, so they were removed from the rewrite hook. Others were real: 186 → 20 bytes, 274 → 89 bytes. |
| [`judgment-log.md`](judgment-log.md) | Per-PR record written in two passes — prediction before reading the diff, evidence after — so the hit rate can't be filled in retroactively | 4 PRs logged. Every factual cell carries its source, because a loop's own PR body is not independent evidence of its own tests passing. |

Each of the three overturned the assumption that prompted it:

- The style rule was written on the assumption that terse output causes bad
  coinages. The **more** compressed arm scored *lower* (2.07 vs 5.57 per 10k) —
  the cause is translation, not compression. A 12-question probe then suggested
  technical vocabulary was safe; the 194-occurrence repo sweep found the exact
  opposite, and every flagged term was technical.
- The proxy was assumed to save tokens everywhere. Measuring each subcommand
  separately is what found the two that saved nothing, and an upstream issue's
  stated cause (locale) did not reproduce.
- The judgment log's format changed after the fact that a fixed 7-line checklist
  left 4 lines blank on every entry, while the numbers that actually decided the
  call had no column and ended up in prose.

Absolute figures without a comparison are not treated as results here — a
measurement with no baseline is recorded as "no baseline yet, this is the first",
not as a pass.

## orch — tmux Claude orchestrator

Automation layer over the [`tmux-claude-session-manager`](https://github.com/craftzdog/tmux-claude-session-manager) plugin. Queue tasks; `orch` auto-spawns `claude-orch-*` tmux sessions to work them (concurrency-capped) and auto-advances pipeline steps by watching the plugin's `@claude_state`. Full docs: [`orch/README.md`](orch/README.md).

`orch` is on `PATH` via `~/.local/bin/orch → ~/.claude/orch/bin/orch`.

### Prerequisite

The plugin's Claude Code hooks (which stamp `@claude_state`) **must** be installed — orch can't detect step completion without them.

### Usage

```bash
# Single task — one prompt, one session, runs unattended
orch add ~/prv/myproject "add a healthcheck endpoint and a test"

# dir is optional — one arg targets the current directory
orch add "add a healthcheck endpoint and a test"

# Pipeline — steps fed one-by-one as each turn finishes
orch pipe ~/prv/myproject \
  "write failing tests for the parser" \
  "make them pass" \
  "refactor and run the full suite"

# Fan-out — one task per dir, same prompt
orch add --each ~/prv/a ~/prv/b ~/prv/c "bump deps and run tests"

# Run with --safe (task prompts for permission instead of skip-perms)
orch add --safe ~/prv/prod-repo "review and fix the migration"

# Start the daemon (default 3 concurrent), then watch/manage
orch start --max 2
orch ls            # status table: queued / working / done / failed
orch logs <id>     # dump a task's session pane
orch stop          # stop daemon (running sessions stay alive)
```

Inspect a running session anytime with the plugin picker (`prefix + u`).

> **Warning:** tasks run with `--dangerously-skip-permissions` by default. Don't point orch at repos where an unreviewed `rm` / `git push` / prod action could do damage — use `--safe` and keep `--max` low there.

See [`orch/README.md`](orch/README.md) for advance/failure semantics and env-var config.
