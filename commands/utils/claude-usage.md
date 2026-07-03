---
name: claude-usage
description: Check Claude AI plan usage limits (session, weekly all-models, weekly Sonnet)
---

# claude-usage

## Description

Checks Claude AI (claude.ai) plan usage limits by running the check_claude_usage.py script.
Displays session usage, weekly all-models usage, and weekly Sonnet usage with progress bars.

## How to Invoke

- `/claude-usage`
- "Check my Claude usage"
- "How much Claude usage do I have left?"
- "Claude usage status"

## Paths

- **Script:** `~/.claude/command-scripts/utils/claude-usage/check_claude_usage.py`
- **Python:** `/Users/jw/.pyenv/versions/3.9.10/bin/python3`
- **Session data:** `~/.config/claude-usage/browser-data/` (Playwright persistent context)
- **Config:** `~/.config/claude-usage/config.json` (org_id, session expiry)
- **Cron log:** `~/.config/claude-usage/usage.log`

## Execution

### Step 0: Prerequisites check (MUST run before anything else)

**0-1. Check if Python 3.9.10 exists:**
```bash
ls /Users/jw/.pyenv/versions/3.9.10/bin/python3
```

If it does NOT exist:
- **Prompt the user:** "Python 3.9.10이 설치되어 있지 않습니다. `pyenv install 3.9.10`으로 설치할까요?"
- Only proceed after user confirms
- Install:
  ```bash
  pyenv install 3.9.10
  ```
- After install, verify it exists before continuing

**0-2. Check if playwright is installed:**
```bash
/Users/jw/.pyenv/versions/3.9.10/bin/python3 -c "import playwright" 2>/dev/null && echo "OK" || echo "MISSING"
```

If MISSING, install playwright and chromium:
```bash
/Users/jw/.pyenv/versions/3.9.10/bin/pip install playwright && /Users/jw/.pyenv/versions/3.9.10/bin/python3 -m playwright install chromium
```

### Step 1: Ask user what they want

Present these options:

1. **Check usage now** — run the script and display results
2. **Check recent logs** — show latest entries from cron log
3. **Manage cron schedule** — view/modify/disable the cron job
4. **Re-login** — session expired, needs manual browser login

### Step 2: Execute based on choice

#### Option 1: Check usage now

```bash
/Users/jw/.pyenv/versions/3.9.10/bin/python3 ~/.claude/command-scripts/utils/claude-usage/check_claude_usage.py
```

For JSON output:
```bash
/Users/jw/.pyenv/versions/3.9.10/bin/python3 ~/.claude/command-scripts/utils/claude-usage/check_claude_usage.py --json
```

**Note:** A brief Chromium window will open and close (Cloudflare blocks headless mode).

If the script returns "Session may be expired":
- Inform user to run option 4 (re-login)

#### Option 2: Check recent logs

Show last N entries from the cron log (each entry is a JSON object, one per cron run):
```bash
# Show last 3 log entries (last 3 cron runs)
tail -3 ~/.config/claude-usage/usage.log
```

Parse the JSON and display in a readable table format comparing the entries.

#### Option 3: Manage cron schedule

First show current crontab:
```bash
crontab -l
```

Then ask user what they want to change. Options:
- **Change interval** — modify how often the cron runs
- **Disable** — remove the cron job
- **Re-enable** — add the cron job back

##### Cron format reference
```
┌─────── minute (0-59)
│ ┌───── hour (0-23)
│ │ ┌─── day of month (1-31)
│ │ │ ┌─ month (1-12)
│ │ │ │ ┌ day of week (0-7, Sun=0 or 7)
│ │ │ │ │
* * * * *
```

##### Current default: every 1 hour
```
0 * * * * PATH="/Users/jw/.pyenv/versions/3.9.10/bin:/usr/local/bin:/usr/bin:/bin" DISPLAY=:0 /Users/jw/.pyenv/versions/3.9.10/bin/python3 /Users/jw/.claude/command-scripts/utils/claude-usage/check_claude_usage.py --json --notify >> /Users/jw/.config/claude-usage/usage.log 2>&1
```

Common schedules:
- Every 2 hours: `0 */2 * * *`
- Every 4 hours: `0 */4 * * *`
- Every 6 hours: `0 */6 * * *`
- Twice daily (9am, 6pm): `0 9,18 * * *`
- Once daily at 9am: `0 9 * * *`
- Weekdays only at 9am: `0 9 * * 1-5`

To modify, replace the cron entry using:
```bash
# Remove old entry and add new one
crontab -l | grep -v 'check_claude_usage' | { cat; echo "<NEW_CRON_LINE>"; } | crontab -
```

To disable:
```bash
crontab -l | grep -v 'check_claude_usage' | crontab -
```

**IMPORTANT:** Always show the user the exact cron line before applying, and confirm.

#### Option 4: Re-login

Run the login command directly (do NOT ask the user to run it separately):
```bash
/Users/jw/.pyenv/versions/3.9.10/bin/python3 ~/.claude/command-scripts/utils/claude-usage/check_claude_usage.py --login
```

- Use `timeout: 120000` (2 min) to allow time for browser login
- A Chromium browser will open automatically for the user to log in
- The script waits and completes once login is detected
- Session is saved and lasts ~28 days

**Also used in Option 1:** If "No session found" or "Session may be expired" is returned,
automatically run `--login` (do NOT ask the user to open a separate terminal).
After login completes, re-run the usage check.

## Technical Notes

- **Cloudflare:** Blocks headless browsers, so the script uses headed Playwright (brief visible window)
- **Session storage:** Playwright persistent context at `~/.config/claude-usage/browser-data/`
- **Session duration:** ~28 days (sessionKey cookie expiry)
- **API endpoint:** `GET /api/organizations/{org_id}/usage` (called via page.evaluate to inherit session)
- **Dependencies:** `playwright` Python package + Chromium (`pip install playwright && playwright install chromium`)

## TODO

- [ ] macOS 알림이 동작하지 않음: `osascript display notification`은 "스크립트 편집기(Script Editor)" 앱을 통해 알림을 보내지만, 시스템 설정 > 알림 목록에 표시되지 않음. 해결 방안:
  - `brew install terminal-notifier` 설치 후 스크립트에서 `terminal-notifier` 사용으로 전환
  - 또는 스크립트 편집기 앱을 한번 직접 실행하여 알림 권한 등록 후 시스템 설정에서 활성화
