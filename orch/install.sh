#!/usr/bin/env bash
# install.sh — per-machine orch setup (idempotent).
# The orch CODE syncs via the claude-config repo, but the PATH symlink, tmux, and
# the tmux-claude-session-manager plugin are per-machine and NOT tracked. Run this
# on each new machine:  bash ~/.claude/orch/install.sh
set -euo pipefail

ORCH_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/bin/orch"

echo "orch install —"

# 1. PATH symlink (the piece that's easy to forget) --------------------------
mkdir -p "$HOME/.local/bin"
ln -sf "$ORCH_BIN" "$HOME/.local/bin/orch"
echo "  ✓ symlink  ~/.local/bin/orch -> $ORCH_BIN"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) echo "  ✓ ~/.local/bin on PATH" ;;
  *) echo "  ! ~/.local/bin NOT on PATH — add to ~/.zshrc:"
     echo "      export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

# 2. tmux (hard requirement) --------------------------------------------------
if command -v tmux >/dev/null 2>&1; then
  echo "  ✓ tmux $(tmux -V | awk '{print $2}')"
else
  echo "  ! tmux missing — run: brew install tmux"
fi

# 3. plugin (orch's completion signal — @claude_state) ------------------------
if [ -d "$HOME/.tmux/plugins/tmux-claude-session-manager" ]; then
  echo "  ✓ tmux-claude-session-manager plugin present"
else
  echo "  ! plugin missing — without it orch can't detect task completion."
  echo "    a) TPM:    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm"
  echo "    b) ~/.tmux.conf must contain:"
  echo "         set -g @plugin 'jongwoo315/tmux-claude-session-manager'"
  echo "         run '~/.tmux/plugins/tpm/tpm'   (at the very bottom)"
  echo "    c) inside tmux press  prefix + I  to fetch the plugin"
fi

echo "—"
echo "next:  orch start --max 3   (long tasks: ORCH_STUCK_SECS=7200 orch start --max 3)"
echo "check: orch ls"
