# claude-config

Personal Claude Code configuration — global instructions, rules, hooks, skills, and tooling. This directory is itself the git repo ([`jongwoo315/claude-config`](https://github.com/jongwoo315/claude-config), private), synced across machines.

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
