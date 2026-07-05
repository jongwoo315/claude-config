#!/usr/bin/env bash
# Runs every t/test_*.sh in its own subshell; nonzero exit if any fail.
set -u
cd "$(dirname "$0")"
rc=0
for f in test_*.sh; do
  [ -e "$f" ] || continue
  printf '== %s ==\n' "$f"
  bash "$f" || rc=1
done
exit $rc
