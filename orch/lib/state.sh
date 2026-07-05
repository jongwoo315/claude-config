#!/usr/bin/env bash
# state.sh — the ONLY place that names @claude_state / touches tmux options.
: "${ORCH_TMUX:=tmux}"
ORCH_SESSION_PREFIX="claude-orch-"

st_set() { $ORCH_TMUX set-option -t "$1" "$2" "$3"; }        # session opt, val
st_get() { $ORCH_TMUX show-options -v -t "$1" "$2" 2>/dev/null; }
st_get_state() { st_get "$1" @claude_state; }               # working|waiting|idle|''
st_get_state_at() { st_get "$1" @claude_state_at; }         # epoch stamped by plugin hook

st_list_orch_sessions() {
  $ORCH_TMUX list-sessions -F '#{session_name}' 2>/dev/null \
    | grep "^${ORCH_SESSION_PREFIX}" || true
}
