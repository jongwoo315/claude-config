#!/usr/bin/env bash
# task.sh — queue file CRUD. One JSON file per task under $ORCH_QUEUE.
: "${ORCH_QUEUE:=$HOME/.claude/orch/queue}"

_task_file() { printf '%s/task-%s.json\n' "$ORCH_QUEUE" "$1"; }

# task_create <dir> <mode> <step...> ; echoes new id
task_create() {
  local dir="$1" mode="$2"; shift 2
  local slug id
  slug=$(basename "$dir" | tr -c 'A-Za-z0-9' '-' | sed 's/-*$//')
  # unique-ish suffix without Date/random: count existing files
  local n; n=$(find "$ORCH_QUEUE" -name 'task-*.json' | wc -l | tr -d ' ')
  id="${slug}-${n}"
  local steps; steps=$(printf '%s\n' "$@" | jq -R . | jq -s .)
  jq -n --arg id "$id" --arg target "$dir" --arg mode "$mode" \
        --argjson steps "$steps" \
    '{id:$id, target:$target, mode:$mode, steps:$steps,
      cursor:0, status:"queued", session:null, skip_perms:true}' \
    > "$(_task_file "$id")"
  printf '%s\n' "$id"
}

task_get()   { jq -r --arg k "$2" '.[$k]' "$(_task_file "$1")"; }
task_step()  { jq -r --argjson i "$2" '.steps[$i]' "$(_task_file "$1")"; }
task_steps_len() { jq -r '.steps | length' "$(_task_file "$1")"; }

# task_set <id> <key> <value>  (value treated as string)
task_set() {
  local f; f=$(_task_file "$1"); local tmp="$f.tmp"
  jq --arg k "$2" --arg v "$3" '.[$k]=$v' "$f" > "$tmp" && mv "$tmp" "$f"
}
# task_set_num <id> <key> <intval>
task_set_num() {
  local f; f=$(_task_file "$1"); local tmp="$f.tmp"
  jq --arg k "$2" --argjson v "$3" '.[$k]=$v' "$f" > "$tmp" && mv "$tmp" "$f"
}

task_list_by_status() {
  local want="$1" f
  for f in "$ORCH_QUEUE"/task-*.json; do
    [ -e "$f" ] || continue
    [ "$(jq -r .status "$f")" = "$want" ] && jq -r .id "$f"
  done
}
