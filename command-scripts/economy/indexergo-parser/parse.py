#!/usr/bin/env python3
"""
INDEXerGO Parser - Fetches and parses macroeconomic indicators from indexergo.com/my
"""

import json
import subprocess
import sys
import os
from pathlib import Path

SKILL_DIR = Path(__file__).parent
COOKIES_FILE = SKILL_DIR / "cookies.json"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


def load_cookies():
    """Load cookies from cookies.json"""
    if not COOKIES_FILE.exists():
        print("ERROR: cookies.json not found. Please create it with cf_clearance and INDEXerGO_flask_session.")
        sys.exit(1)

    with open(COOKIES_FILE) as f:
        return json.load(f)


def fetch_page(cookies):
    """Fetch the indexergo.com/my page"""
    cookie_str = f"cf_clearance={cookies['cf_clearance']}; INDEXerGO_flask_session={cookies['INDEXerGO_flask_session']}"

    result = subprocess.run([
        "curl", "-s", "https://indexergo.com/my",
        "-H", f"User-Agent: {USER_AGENT}",
        "-H", f"Cookie: {cookie_str}"
    ], capture_output=True, text=True)

    return result.stdout


def parse_indicators(html):
    """Parse indicators from HTML using BeautifulSoup"""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "beautifulsoup4", "-q"])
        from bs4 import BeautifulSoup

    # Check for 403 error
    if "403 Forbidden" in html:
        return None, "403 Forbidden - Cookies expired"

    soup = BeautifulSoup(html, "html.parser")

    # Extract groups
    groups = []
    for g in soup.find_all("span", class_="fw-bold", style=lambda x: x and "0.95rem" in x):
        groups.append(g.text.strip())

    # Extract indicators
    indicators = []
    cards = soup.select("div.card-body.border-top a.row.no-gutters.align-items-center")

    for card in cards:
        try:
            indicator = {}

            # Category
            cat_div = card.find("div", class_="text-xxs")
            indicator["category"] = cat_div.text.strip() if cat_div else ""

            # English name
            eng_div = card.find("div", class_="text-danger text-xxs")
            indicator["english_name"] = eng_div.text.strip() if eng_div else ""

            # Korean name
            name_container = card.find("div", class_="d-flex align-items-start")
            if name_container:
                name_inner = name_container.find("div", class_="")
                indicator["name"] = name_inner.text.strip() if name_inner else ""
            else:
                indicator["name"] = ""

            # Date
            date_div = card.find("div", class_="mb-0 fst-italic text-xs text-gray-700")
            indicator["date"] = date_div.text.strip() if date_div else ""

            # Value
            value_div = card.find("div", style=lambda x: x and "letter-spacing" in x)
            if value_div:
                value_text = value_div.get_text(strip=True)
                parts = value_text.split()
                indicator["value"] = parts[0] if parts else ""
                indicator["unit"] = " ".join(parts[1:]) if len(parts) > 1 else ""
            else:
                indicator["value"] = ""
                indicator["unit"] = ""

            # Changes
            change_divs = card.find_all("div", class_=lambda x: x and "text-070" in str(x) if x else False)
            changes = []
            for cd in change_divs:
                change_text = cd.get_text(" ", strip=True)
                changes.append(change_text)
            indicator["changes"] = changes

            if indicator["name"]:
                indicators.append(indicator)
        except Exception:
            pass

    return {"groups": groups, "indicators": indicators}, None


def format_output(data):
    """Format parsed data for display"""
    output = []
    output.append(f"=== INDEXerGO Dashboard ===\n")
    output.append(f"Groups: {', '.join(data['groups'])}\n")
    output.append(f"Total indicators: {len(data['indicators'])}\n")
    output.append("")

    for ind in data["indicators"]:
        output.append(f"📊 {ind['name']}")
        if ind["english_name"]:
            output.append(f"   EN: {ind['english_name']}")
        output.append(f"   Category: {ind['category']}")
        output.append(f"   Date: {ind['date']}")
        output.append(f"   Value: {ind['value']} {ind['unit']}")
        for c in ind["changes"]:
            output.append(f"   Change: {c}")
        output.append("")

    return "\n".join(output)


def main():
    """Main entry point"""
    cookies = load_cookies()
    html = fetch_page(cookies)

    data, error = parse_indicators(html)

    if error:
        print(f"ERROR: {error}")
        print("\nPlease update cookies.json with fresh cookies:")
        print("  - cf_clearance: [from browser DevTools > Application > Cookies]")
        print("  - INDEXerGO_flask_session: [from browser DevTools > Application > Cookies]")
        sys.exit(1)

    # Output as JSON if --json flag
    if "--json" in sys.argv:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        print(format_output(data))


if __name__ == "__main__":
    main()
