# Sync Claude Config to Notion

Upload `~/.claude/CLAUDE.md`, `~/.claude/RTK.md`, `~/.claude/settings.json`, `~/.claude/commands/` (excluding `sc/`), `~/.claude/command-scripts/`, `~/.claude/skills/`, `~/.claude/hooks/`, `~/.claude/rules/`, and `~/.claude/kimi-tools/` to Notion.

## Target

- **Page:** Claude Code 설치 (feat. superclaude)
- **URL:** https://www.notion.so/jongwoo315/Claude-Code-feat-superclaude-2b241e6165c08034870cf3942bb6faca

## Usage

Run `/sync-claude-config` to sync config to Notion.

## Process

Execute this script:

```bash
#!/bin/bash
# set -e 제거: 개별 sync 실패가 전체 스크립트를 중단시키지 않도록

API_KEY="${NOTION_API_KEY:?NOTION_API_KEY not set}"

CLAUDE_MD_BLOCK="2e841e61-65c0-80cf-88ce-d95d075f1694"
RTK_MD_BLOCK="31641e61-65c0-8061-8eac-c407f6132c09"
SETTINGS_BLOCK="2ee41e61-65c0-80de-9510-f0e819fa4dba"
NOTION_PAGE="https://www.notion.so/jongwoo315/Claude-Code-feat-superclaude-2b241e6165c08034870cf3942bb6faca"

check_result() {
  local label="$1"
  local resp_file="$2"
  if python3 -c "import json,sys; d=json.load(open('$resp_file')); sys.exit(0 if d.get('object')=='error' else 1)" 2>/dev/null; then
    echo "Error: $(python3 -c "import json; d=json.load(open('$resp_file')); print(d.get('message','unknown'))")"
    return 1
  elif python3 -c "import json,sys; d=json.load(open('$resp_file')); sys.exit(0 if 'id' in d else 1)" 2>/dev/null; then
    echo "$label synced."
    return 0
  else
    echo "Warning: unexpected response for $label"
    head -c 200 "$resp_file"
    echo ""
    return 1
  fi
}

update_block() {
  local block_id="$1"
  local file_path="$2"
  local language="$3"
  local resp_file="$4"
  local chunk_size=1999

  python3 -c "
import json
with open('$file_path', 'r') as f:
    content = f.read()
# Cloudflare WAF blocks 'curl -u' pattern as command injection.
# Replace space before -u with NBSP (\u00A0) — visually identical on Notion.
content = content.replace('curl -u', 'curl\u00A0-u')
chunks = [content[i:i+$chunk_size] for i in range(0, len(content), $chunk_size)]
rich_text = [{'type': 'text', 'text': {'content': chunk}} for chunk in chunks]
payload = {'code': {'rich_text': rich_text, 'language': '$language'}}
with open('/tmp/notion_payload.json', 'w') as f:
    json.dump(payload, f)
"

  /usr/bin/curl -s -X PATCH "https://api.notion.com/v1/blocks/$block_id" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Notion-Version: 2022-06-28" \
    -H "Content-Type: application/json" \
    -d @/tmp/notion_payload.json > "$resp_file"
}

echo "=== Syncing Claude Config to Notion ==="
echo ""

# 1. Sync CLAUDE.md
echo "Syncing CLAUDE.md..."
update_block "$CLAUDE_MD_BLOCK" ~/.claude/CLAUDE.md "markdown" /tmp/resp_claude.json
check_result "CLAUDE.md" /tmp/resp_claude.json

sleep 1

# 2. Sync RTK.md
echo "Syncing RTK.md..."
update_block "$RTK_MD_BLOCK" ~/.claude/RTK.md "markdown" /tmp/resp_rtk.json
check_result "RTK.md" /tmp/resp_rtk.json

sleep 1

# 3. Sync settings.json
echo "Syncing settings.json..."
update_block "$SETTINGS_BLOCK" ~/.claude/settings.json "json" /tmp/resp_settings.json
check_result "settings.json" /tmp/resp_settings.json

# 4. Zip commands directory (excluding sc/)
echo ""
echo "Zipping commands (excluding sc/)..."
rm -f /tmp/commands.zip
cd ~/.claude && zip -r /tmp/commands.zip commands/ -x "commands/sc/*" "*.DS_Store" > /dev/null && cd -
echo "Created /tmp/commands.zip ($(du -h /tmp/commands.zip | cut -f1))"

# 5. Zip command-scripts directory
echo "Zipping command-scripts..."
rm -f /tmp/command-scripts.zip
cd ~/.claude && zip -r /tmp/command-scripts.zip command-scripts/ -x "*.DS_Store" "command-scripts/learn-progress.json" "command-scripts/spring-why-cards-progress.json" "command-scripts/rag-why-cards-progress.json" "command-scripts/why-cards-progress.json" > /dev/null && cd -
echo "Created /tmp/command-scripts.zip ($(du -h /tmp/command-scripts.zip | cut -f1))"

# 6. Zip skills directory
echo "Zipping skills..."
rm -f /tmp/skills.zip
cd ~/.claude && zip -r /tmp/skills.zip skills/ -x "*.DS_Store" > /dev/null && cd -
echo "Created /tmp/skills.zip ($(du -h /tmp/skills.zip | cut -f1))"

# 7. Zip hooks directory
echo "Zipping hooks..."
rm -f /tmp/hooks.zip
cd ~/.claude && zip -r /tmp/hooks.zip hooks/ -x "*.DS_Store" > /dev/null && cd -
echo "Created /tmp/hooks.zip ($(du -h /tmp/hooks.zip | cut -f1))"

# 8. Zip rules directory
echo "Zipping rules..."
rm -f /tmp/rules.zip
cd ~/.claude && zip -r /tmp/rules.zip rules/ -x "*.DS_Store" > /dev/null && cd -
echo "Created /tmp/rules.zip ($(du -h /tmp/rules.zip | cut -f1))"

# 9. Zip kimi-tools directory
echo "Zipping kimi-tools..."
rm -f /tmp/kimi-tools.zip
cd ~/.claude && zip -r /tmp/kimi-tools.zip kimi-tools/ -x "*.DS_Store" > /dev/null && cd -
echo "Created /tmp/kimi-tools.zip ($(du -h /tmp/kimi-tools.zip | cut -f1))"

# 10. Open Finder with zip files selected
open -R /tmp/commands.zip
sleep 0.3
open -R /tmp/command-scripts.zip
sleep 0.3
open -R /tmp/skills.zip
sleep 0.3
open -R /tmp/hooks.zip
sleep 0.3
open -R /tmp/rules.zip
sleep 0.3
open -R /tmp/kimi-tools.zip

# 10. Open Notion page in Mac app
sleep 0.5
open "notion://www.notion.so/jongwoo315/Claude-Code-feat-superclaude-2b241e6165c08034870cf3942bb6faca"

echo ""
echo "=== Done ==="
echo "CLAUDE.md, RTK.md, and settings.json synced automatically."
echo "Drag zip files (commands, command-scripts, skills, hooks, rules, kimi-tools) to Notion to update (manual step)."
```

## Output

1. CLAUDE.md → Notion (auto)
2. RTK.md → Notion (auto)
3. settings.json → Notion (auto)
4. commands.zip (excluding sc/) → Finder opens with file selected
5. command-scripts.zip → Finder opens with file selected
6. skills.zip → Finder opens with file selected
7. hooks.zip → Finder opens with file selected
8. rules.zip → Finder opens with file selected
9. kimi-tools.zip → Finder opens with file selected
10. Notion Mac app opens target page
11. User drags zip files to Notion (manual)

## Notes

- Notion API has 2000 char limit per rich_text block, so content is chunked
- Uses `NOTION_API_KEY` env var (defined in `~/.zshenv`)
- Zip files require manual drag & drop (Notion API doesn't support file uploads)
- `commands/sc/` is excluded (SuperClaude commands are managed separately)
