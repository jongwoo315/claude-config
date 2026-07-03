# Sync .zshrc and .zshenv to Notion

Upload password-protected zips of `~/.zshrc` and `~/.zshenv` to Notion as separate files.

## Target

- **Page:** iTerm2
- **URL:** https://www.notion.so/jongwoo315/iTerm2-ab4c5445dede4062ab1fcb0a98e6ece0
- **Sections:** zshrc (heading_3), zshenv (heading_3)

## Usage

Run `/sync-zshrc` to create encrypted zips and upload to Notion.

## Process

**Step 1:** Use `AskUserQuestion` to get the zip password from the user BEFORE running the script.
Bash tool does NOT support interactive stdin (`read -s`), so password must be collected via AskUserQuestion first.

**Step 2:** Execute this script with `ZIP_PASSWORD` substituted:

```bash
#!/bin/bash
set -e

ZIP_PASSWORD="<password from AskUserQuestion>"

echo "=== Syncing .zshrc and .zshenv to Notion ==="

# 1. Create password-protected zips (copy without dot so they're visible after unzip)
rm -f /tmp/zshrc.zip /tmp/zshrc /tmp/zshenv.zip /tmp/zshenv

cp ~/.zshrc /tmp/zshrc
cp ~/.zshenv /tmp/zshenv

cd /tmp
zip -e -P "$ZIP_PASSWORD" /tmp/zshrc.zip zshrc > /dev/null
zip -e -P "$ZIP_PASSWORD" /tmp/zshenv.zip zshenv > /dev/null
rm -f /tmp/zshrc /tmp/zshenv

echo "Created /tmp/zshrc.zip ($(du -h /tmp/zshrc.zip | cut -f1))"
echo "Created /tmp/zshenv.zip ($(du -h /tmp/zshenv.zip | cut -f1))"

# 2. Open Finder with files selected
open /tmp/

# 3. Open Notion page in Mac app
sleep 0.5
open "notion://www.notion.so/jongwoo315/iTerm2-ab4c5445dede4062ab1fcb0a98e6ece0"

echo ""
echo "=== Done ==="
echo "Drag zshrc.zip to the 'zshrc' section and zshenv.zip to the 'zshenv' section in Notion."
```

## Output

1. zshrc.zip + zshenv.zip (password-protected) created at /tmp/
2. Finder opens /tmp/
3. Notion Mac app opens target page
4. User drags each zip to its respective section in Notion (manual)

## Notes

- Uses standard `zip -e` encryption (ZipCrypto)
- The existing zshrc file block in Notion (`2fc41e61-65c0-80ed-aa8f-cb6b3f7051d1`) is under the "zshrc" heading
- Create a "zshenv" heading_3 section in Notion if it doesn't exist yet
- Notion API doesn't support file uploads, so drag & drop is required
