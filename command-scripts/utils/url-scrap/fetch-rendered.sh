#!/usr/bin/env bash
# Render a JS-heavy page with local headless Chrome and print its text to stdout.
#
# WHY: WebFetch does a single HTTP GET and never runs JS, so a CSR page returns
# 200 with only its shell (nav, footer, og meta). This runs the real engine.
# Needs no extension permission — that's the point; it works where the
# claude-in-chrome extension is blocked by its site allowlist.
#
# usage: fetch-rendered.sh <url> [--html]
#        BUDGET=20000 fetch-rendered.sh <url>    # slower pages
set -uo pipefail

URL="${1:?usage: fetch-rendered.sh <url> [--html]}"
WANT_HTML="${2:-}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$CHROME" ] || { echo "Chrome not found: $CHROME" >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
HTML="$WORK/page.html"

"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --virtual-time-budget="${BUDGET:-10000}" \
  --user-data-dir="$WORK/profile" \
  --dump-dom "$URL" > "$HTML" 2>"$WORK/err" &
pid=$!

# Chrome writes the DOM and then LINGERS — its updater/crash-handler children keep
# the process alive, so `wait $pid` hangs past any sane timeout. Poll the dump
# instead: once the file stops growing we have the whole DOM, then kill it.
prev=-1; stable=0
for _ in $(seq 1 "${MAXWAIT:-60}"); do
  sleep 1
  cur=$(wc -c < "$HTML" 2>/dev/null | tr -d ' ' || echo 0)
  if [ "${cur:-0}" -gt 0 ] && [ "$cur" = "$prev" ]; then
    stable=$((stable + 1))
    [ "$stable" -ge 2 ] && break
  else
    stable=0
  fi
  prev=$cur
done
kill "$pid" 2>/dev/null
wait "$pid" 2>/dev/null

bytes=$(wc -c < "$HTML" | tr -d ' ')
if [ "${bytes:-0}" -lt 100 ]; then
  echo "empty DOM dump (${bytes}B). stderr tail:" >&2
  tail -5 "$WORK/err" >&2
  exit 1
fi

if [ "$WANT_HTML" = "--html" ]; then
  cat "$HTML"
  exit 0
fi

python3 - "$HTML" <<'PY'
import re, sys
from html.parser import HTMLParser

SKIP = {"script", "style", "noscript", "svg", "head"}
BREAK = {"p","div","h1","h2","h3","h4","li","br","section","article","tr"}

class T(HTMLParser):
    def __init__(self):
        super().__init__(); self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in SKIP: self.skip += 1
        if tag in BREAK: self.out.append("\n")
    def handle_endtag(self, tag):
        if tag in SKIP and self.skip: self.skip -= 1
    def handle_data(self, d):
        if not self.skip:
            s = d.strip()
            if s: self.out.append(s + " ")

p = T()
p.feed(open(sys.argv[1], encoding="utf-8", errors="ignore").read())
txt = re.sub(r"[ \t]+", " ", "".join(p.out))
txt = re.sub(r"\n\s*\n+", "\n\n", txt).strip()
print(f"[extracted {len(txt)} chars]", file=sys.stderr)
print(txt)
PY
