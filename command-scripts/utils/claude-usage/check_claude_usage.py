#!/usr/bin/env python3
"""Claude AI Usage Checker

Checks claude.ai plan usage limits via the internal API.
Uses Playwright persistent browser context to maintain session across runs.
Runs in headed mode (brief browser window) because Cloudflare blocks headless.

Setup:
  pip install playwright && playwright install chromium
  python check_usage.py --login    # first time: manual Google login

Usage:
  python check_usage.py            # check usage (brief browser window)
  python check_usage.py --json     # JSON output
  python check_usage.py --notify-slack <webhook_url>

Session: ~/.config/claude-usage/browser-data/ (persistent, ~28 day expiry)
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

BROWSER_DATA_DIR = Path.home() / ".config" / "claude-usage" / "browser-data"
CONFIG_PATH = Path.home() / ".config" / "claude-usage" / "config.json"
BASE_URL = "https://claude.ai"


def _ensure_playwright():
    try:
        from playwright.sync_api import sync_playwright
        return sync_playwright
    except ImportError:
        print("Error: 'playwright' package required.")
        print("Install with: pip install playwright && playwright install chromium")
        sys.exit(1)


def _launch_context(sync_playwright_cls, headless=False):
    """Launch persistent browser context."""
    BROWSER_DATA_DIR.mkdir(parents=True, exist_ok=True)
    p = sync_playwright_cls().start()
    context = p.chromium.launch_persistent_context(
        user_data_dir=str(BROWSER_DATA_DIR),
        headless=headless,
        args=["--disable-blink-features=AutomationControlled"],
    )
    return p, context


def load_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def save_config(config: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(config, indent=2) + "\n")
    CONFIG_PATH.chmod(0o600)


def fetch_usage() -> Optional[dict]:
    """Fetch usage data using Playwright persistent context (headed)."""
    sync_playwright = _ensure_playwright()
    config = load_config()
    org_id = config.get("org_id", "")

    p, context = _launch_context(sync_playwright)

    try:
        page = context.pages[0] if context.pages else context.new_page()

        # Navigate to claude.ai to establish context
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30_000)

        # Check if redirected to login
        if "/login" in page.url:
            return None

        # Extract org_id if we don't have it
        if not org_id:
            org_id = page.evaluate("""() => {
                const cookie = document.cookie
                    .split(';')
                    .find(c => c.trim().startsWith('lastActiveOrg='));
                return cookie ? cookie.split('=')[1].trim() : '';
            }""")
            if org_id:
                config["org_id"] = org_id
                save_config(config)

        if not org_id:
            return None

        # Fetch usage via the page's fetch API (inherits session)
        data = page.evaluate("""(orgId) => {
            return fetch(`/api/organizations/${orgId}/usage`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        }""", org_id)

        return data
    finally:
        context.close()
        p.stop()


def do_login():
    """Open browser for manual login, save session."""
    sync_playwright = _ensure_playwright()

    p, context = _launch_context(sync_playwright)

    try:
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(f"{BASE_URL}/login")

        print("Please log in manually in the browser window...")
        print("Waiting for login to complete (timeout: 5 min)...")

        try:
            page.wait_for_url("**/new**", timeout=300_000)
        except Exception:
            print("Login timed out or failed.")
            context.close()
            p.stop()
            sys.exit(1)

        print("Login successful! Saving session...")

        cookies = context.cookies(BASE_URL)
        org_cookie = next((c for c in cookies if c["name"] == "lastActiveOrg"), None)
        session_cookie = next((c for c in cookies if c["name"] == "sessionKey"), None)

        config = load_config()
        if org_cookie:
            config["org_id"] = org_cookie["value"]
        if session_cookie:
            config["session_expires"] = datetime.fromtimestamp(
                session_cookie["expires"], tz=timezone.utc
            ).isoformat()
        save_config(config)

        print(f"Session saved to {BROWSER_DATA_DIR}")
        if config.get("session_expires"):
            print(f"Session expires: {config['session_expires']}")
    finally:
        context.close()
        p.stop()

    # Verify
    print("\nVerifying session...")
    data = fetch_usage()
    if data:
        print("OK!")
        print(format_usage(data))
    else:
        print("Warning: Could not verify session. Try running again.")


def format_time_remaining(resets_at: str) -> str:
    reset_dt = datetime.fromisoformat(resets_at)
    now = datetime.now(timezone.utc)
    delta = reset_dt - now

    if delta.total_seconds() <= 0:
        return "expired"

    days = delta.days
    hours, remainder = divmod(delta.seconds, 3600)
    minutes = remainder // 60

    parts = []
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    return " ".join(parts) if parts else "<1m"


def format_usage(data: dict) -> str:
    lines = []
    lines.append("=== Claude Usage ===\n")

    mapping = [
        ("five_hour", "Session (5hr)"),
        ("seven_day", "All models (weekly)"),
        ("seven_day_sonnet", "Sonnet (weekly)"),
        ("seven_day_opus", "Opus (weekly)"),
        ("seven_day_cowork", "Cowork (weekly)"),
        ("seven_day_oauth_apps", "OAuth apps (weekly)"),
    ]

    for key, label in mapping:
        entry = data.get(key)
        if entry is None:
            continue
        pct = entry["utilization"]
        resets = format_time_remaining(entry["resets_at"])
        bar = _progress_bar(pct)
        lines.append(f"  {label:<22} {bar} {pct:>3}%  (resets in {resets})")

    extra = data.get("extra_usage")
    lines.append(f"\n  Extra usage: {'enabled' if extra else 'off'}")
    lines.append("")
    return "\n".join(lines)


def _progress_bar(pct: int, width: int = 20) -> str:
    filled = int(width * pct / 100)
    empty = width - filled
    if pct >= 80:
        return f"[{'#' * filled}{'.' * empty}]"
    elif pct >= 50:
        return f"[{'=' * filled}{'.' * empty}]"
    else:
        return f"[{'-' * filled}{'.' * empty}]"


def _send_macos_notification(data: dict):
    import subprocess

    lines = []
    mapping = [
        ("five_hour", "Session"),
        ("seven_day", "All models"),
        ("seven_day_sonnet", "Sonnet"),
    ]
    for key, label in mapping:
        entry = data.get(key)
        if entry is None:
            continue
        pct = entry["utilization"]
        resets = format_time_remaining(entry["resets_at"])
        lines.append(f"{label}: {pct}% (resets {resets})")

    body = "  |  ".join(lines)
    script = (
        f'display notification "{body}" '
        f'with title "Claude Usage"'
    )
    subprocess.run(["osascript", "-e", script], check=False)


def _send_slack(webhook_url: str, data: dict):
    import urllib.request

    blocks = []
    mapping = [
        ("five_hour", "Session (5hr)"),
        ("seven_day", "All models (weekly)"),
        ("seven_day_sonnet", "Sonnet (weekly)"),
    ]
    for key, label in mapping:
        entry = data.get(key)
        if entry is None:
            continue
        pct = entry["utilization"]
        resets = format_time_remaining(entry["resets_at"])
        blocks.append(f"*{label}*: {pct}% used (resets in {resets})")

    payload = json.dumps({"text": "*Claude Usage Report*\n" + "\n".join(blocks)}).encode()

    try:
        req = urllib.request.Request(
            webhook_url, data=payload,
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=10)
        print("Slack notification sent.")
    except Exception as e:
        print(f"Slack notification error: {e}")


def main():
    parser = argparse.ArgumentParser(description="Check Claude AI usage limits")
    parser.add_argument("--json", action="store_true", help="Output raw JSON")
    parser.add_argument("--login", action="store_true", help="Open browser to log in")
    parser.add_argument("--notify", action="store_true", help="Send macOS notification")
    parser.add_argument(
        "--notify-slack", metavar="WEBHOOK_URL", help="Send usage to Slack webhook"
    )
    args = parser.parse_args()

    if args.login:
        do_login()
        return

    if not BROWSER_DATA_DIR.exists():
        print("No session found. Run with --login first:")
        print("  python check_usage.py --login")
        sys.exit(1)

    data = fetch_usage()

    if data is None:
        print("Failed to fetch usage. Session may be expired.")
        print("Run with --login to re-authenticate.")
        sys.exit(1)

    if args.json:
        print(json.dumps(data, indent=2))
    else:
        print(format_usage(data))

    if args.notify:
        _send_macos_notification(data)

    if args.notify_slack:
        _send_slack(args.notify_slack, data)


if __name__ == "__main__":
    main()
