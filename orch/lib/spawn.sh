#!/usr/bin/env bash
# spawn.sh — create a detached claude-orch-* session and send its first step.
: "${ORCH_TMUX:=tmux}"
: "${ORCH_CLAUDE_CMD:=claude}"
. "$(dirname "${BASH_SOURCE[0]}")/state.sh"

# submit_step <sess> <text> — type a prompt into a live claude session and make
# sure it actually SUBMITS. Don't trust a fixed delay or the transient "esc to
# interrupt" marker: resend Enter until the prompt LEAVES the input box (the input
# line no longer carries our first token). Only signal that holds across banners,
# slow spawns, and model tiers. Used for both step0 (spawn) and every advance step
# — an advance send without this loses Enter on a busy TUI and the step sits unsent
# at the prompt, deadlocking the pipeline (orch waits for an idle that never comes).
submit_step() {
  local sess="$1" text="$2"
  $ORCH_TMUX send-keys -t "$sess" -- "$text"
  local probe="${text%% *}"      # first token — cheap unsent fingerprint
  local j=0
  while [ $j -lt 30 ]; do
    $ORCH_TMUX send-keys -t "$sess" C-m
    sleep 0.8
    # Unsent iff the INPUT BOX still holds our token. Two things make that test
    # trickier than it looks, and getting either wrong is silent:
    #   - Only the LAST prompt-marker line counts. A submitted prompt stays on
    #     screen in the transcript rendered with the very same marker, so a plain
    #     "any line has marker+token" test never goes false and would resend Enter
    #     all 30 times into a session that is already working.
    #   - No space after the marker. Claude Code renders '❯' + U+00A0 (NO-BREAK
    #     SPACE), not an ASCII space. The old pattern '(❯|>) ' therefore never
    #     matched, every attempt took the `|| break` branch, and the retry loop was
    #     dead — exactly one Enter was ever sent. When a startup banner redraw ate
    #     it (seen 2026-08-19) the prompt just sat in the box forever and the
    #     pipeline deadlocked waiting for an idle that could not come.
    # Anchor the marker at column 0 so a '>' inside transcript output can't be
    # mistaken for the input box.
    $ORCH_TMUX capture-pane -pt "$sess" \
      | grep -E '^(❯|>)' | tail -1 | grep -qF "$probe" || break
    j=$((j+1))
  done
  # Log only the unhealthy paths, to the daemon's stderr (stdout here is captured
  # by spawn_session's $(...) and would end up as the session name). j=0 is the
  # baseline — one Enter, submitted — so ANY line appearing at all means the TUI
  # swallowed a keystroke, and that is the whole signal. Without it a 0-retry and a
  # 29-retry submit look identical in the log, which is why the dead retry loop went
  # 89 days unnoticed: it only bit when a banner redraw happened to eat the Enter.
  if [ $j -ge 30 ]; then
    printf '%s submit %s: UNSENT after %d enters — prompt still in input box\n' \
      "$(date '+%F %T')" "$sess" "$j" >&2
  elif [ $j -gt 0 ]; then
    printf '%s submit %s: submitted after %d retries\n' \
      "$(date '+%F %T')" "$sess" "$j" >&2
  fi
}

# spawn_session <task_id> <dir> <step0> <skip_perms:true|false> ; echoes session name
spawn_session() {
  local id="$1" dir="$2" step0="$3" skip="$4"
  # Session name MIRRORS the task id ({jira}-{subject}) so `orch ls`, the picker row
  # and tmux all read the same label. (Deriving it from the dir slug instead left the
  # session showing the repo-prefixed worktree name, and appending ${id##*-} tacked
  # the ticket NUMBER on as a bogus suffix.) task_create already guarantees the id is
  # unique; the loop below only covers a session that outlived its task file — e.g.
  # re-dispatching a ticket after `orch clean` removed the json but the pane lingered.
  local sess="${ORCH_SESSION_PREFIX}${id}" n=1
  while $ORCH_TMUX has-session -t "$sess" 2>/dev/null; do
    sess="${ORCH_SESSION_PREFIX}${id}-${n}"; n=$((n+1))
  done

  $ORCH_TMUX new-session -d -s "$sess" -c "$dir"
  st_set "$sess" @orch_task "$id"
  # Picker label. Without it the row falls back to the worktree dir basename
  # (pf-policy-bot-DEV-7133); an orch session has no explicit /rename title.
  st_set "$sess" @claude_title "$id"
  # @claude_state is owned by the plugin's Claude Code hooks — do NOT self-stamp it.
  # A self-stamped working masks the session's real state (idle/waiting) in the
  # picker and makes the @orch_await start-gate read our own stamp instead of the
  # session actually starting. @orch_await alone gates start->complete.
  st_set "$sess" @orch_await working

  local flags=""
  [ "$skip" = "true" ] && flags="--dangerously-skip-permissions"
  # 세션 picker에 raw session-id 대신 읽을 수 있는 라벨을 표시. --name은 명시적 이름
  # (nameSource 없음)이라 picker title 최우선순위를 잡는다. 값은 task id 그대로 —
  # picker의 claude- prefix 필터는 tmux 세션명(claude-orch-*)에만 걸리므로 라벨에
  # prefix를 덧붙이면 "claude-DEV-7133"처럼 노이즈만 붙는다.
  flags="$flags --name $id"
  # 실행 티어. ralph는 이미 승인된 plan을 TDD로 옮기는 실행 단계고, 판단은 그 앞
  # Kickoff 게이트에서 사람이 끝낸다 — 여기에 Opus를 쓰면 값이 안 나온다.
  # settings.json 의 전역 `model` 을 물려받지 않고 여기서 못 박는 이유: 대화형
  # 기본값을 opus 로 되돌리는 순간 orch 세션까지 조용히 같이 올라간다 (89·92 가
  # sonnet 으로 돈 것도 전역값을 물려받은 결과지 의도한 지정이 아니었다).
  # plan 이 얇거나 정찰이 섞인 티켓은 ORCH_MODEL=opus orch add ... 로 올린다.
  flags="$flags --model ${ORCH_MODEL:-sonnet}"
  if [ "$ORCH_CLAUDE_CMD" = "claude" ]; then
    # real claude: launch, wait for its TUI to be READY, then send + submit.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags" C-m
    # Readiness: wait for claude's actual status/input UI to render.
    local i=0
    while [ $i -lt 40 ]; do
      $ORCH_TMUX capture-pane -pt "$sess" \
        | grep -qiE 'for shortcuts|bypass permissions|Model:' && break
      sleep 0.5; i=$((i+1))
    done
    # The readiness markers also appear on startup NOTICE screens (usage/model
    # banners), which keep redrawing and swallow Enter keys sent too early. Let
    # the layout settle before typing.
    sleep 1.5
    submit_step "$sess" "$step0"
  else
    # mock command (tests): single-line send keeps things fast/deterministic.
    $ORCH_TMUX send-keys -t "$sess" "$ORCH_CLAUDE_CMD $flags $(printf %q "$step0")" C-m
  fi
  printf '%s\n' "$sess"
}
