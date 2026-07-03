#!/usr/bin/env python3
"""
Share calculator for LOC orders.

Reads indexergo-analyzer reports or manual params,
fetches current ETF prices + USD/KRW rate,
outputs share counts + LOC limit prices.

Usage:
  # From latest indexergo report
  python calc.py --from-report

  # From specific report
  python calc.py --from-report --date 2026-02-09

  # Manual params (KRW total, percentages)
  python calc.py --total 2000000 --etfs "VOO:60,QQQ:40"

  # Manual params (KRW amounts directly)
  python calc.py --amounts "SGOV:144589,GLD:857096,QLD:259581,JEPQ:697158"
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import urlopen, Request

REPORTS_DIR = Path.home() / ".claude/data/economy/indexergo-analyzer/reports"
LOC_BUFFER = 1.10  # 10% above current price


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def get_exchange_rate() -> float:
    """Fetch current USD/KRW rate from Yahoo Finance."""
    url = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1d"
    data = fetch_json(url)
    return data["chart"]["result"][0]["meta"]["regularMarketPrice"]


def get_etf_price(ticker: str) -> float:
    """Fetch current ETF price in USD from Yahoo Finance."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1d"
    data = fetch_json(url)
    return data["chart"]["result"][0]["meta"]["regularMarketPrice"]


def parse_report_action_plan(report_path: Path) -> dict[str, int] | None:
    """Parse '추가 매수 금액' from the action plan table. Returns {ticker: krw_amount}."""
    text = report_path.read_text()

    # Look for the deposit-only action plan table
    # Format: | SGOV | 2,067,477원 | **144,589원** | 2,212,066원 | 25.0% |
    pattern = re.compile(
        r"\|\s*(\w+)\s*\|[^|]+\|\s*\*{0,2}([\d,]+)원\*{0,2}\s*\|[^|]+\|[^|]+\|"
    )

    # Find the action plan section
    action_section = re.search(
        r"(?:Deposit-Only|리밸런싱 액션 플랜|매수 금액).*?(\|.*?\|.*?\n(?:\|.*?\|.*?\n)*)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if not action_section:
        return None

    section_text = action_section.group(0)
    amounts = {}
    for match in pattern.finditer(section_text):
        ticker = match.group(1).upper()
        if ticker in ("합계", "TICKER", "**합계**"):
            continue
        krw = int(match.group(2).replace(",", ""))
        if krw > 0:
            amounts[ticker] = krw

    return amounts if amounts else None


def parse_report_percentages(report_path: Path) -> dict[str, int] | None:
    """Parse recommended percentages from the portfolio table. Returns {ticker: pct}."""
    text = report_path.read_text()

    # Format: | SGOV | 30% | **25%** | -5% | ... |
    # or:     | SGOV | 30% | 25% | -5% | ... |
    pattern = re.compile(
        r"\|\s*(\w+)\s*\|\s*\d+%\s*\|\s*\*{0,2}(\d+)%\*{0,2}\s*\|"
    )

    pcts = {}
    for match in pattern.finditer(text):
        ticker = match.group(1).upper()
        if ticker in ("TICKER",):
            continue
        pcts[ticker] = int(match.group(2))

    return pcts if pcts else None


def get_latest_report(date: str | None = None) -> Path:
    """Get the latest (or specific date) report file."""
    if date:
        path = REPORTS_DIR / f"{date}.md"
        if not path.exists():
            print(f"Error: report not found: {path}", file=sys.stderr)
            sys.exit(1)
        return path

    reports = sorted(REPORTS_DIR.glob("*.md"), reverse=True)
    if not reports:
        print(f"Error: no reports found in {REPORTS_DIR}", file=sys.stderr)
        sys.exit(1)
    return reports[0]


def calculate_shares(
    amounts_krw: dict[str, int], exchange_rate: float
) -> list[dict]:
    """Calculate share counts and LOC limits for each ticker."""
    results = []
    for ticker, krw in amounts_krw.items():
        price_usd = get_etf_price(ticker)
        usd_amount = krw / exchange_rate
        shares = int(usd_amount / price_usd)  # floor
        loc_limit = round(price_usd * LOC_BUFFER, 2)

        results.append(
            {
                "ticker": ticker,
                "krw_amount": krw,
                "usd_amount": round(usd_amount, 2),
                "price": round(price_usd, 2),
                "shares": shares,
                "loc_limit": loc_limit,
                "actual_cost_usd": round(shares * price_usd, 2),
                "actual_cost_krw": round(shares * price_usd * exchange_rate),
            }
        )
    return results


def print_results(results: list[dict], exchange_rate: float, source: str):
    """Print formatted output."""
    print()
    print(f"  Source: {source}")
    print(f"  USD/KRW: {exchange_rate:,.0f}")
    print(f"  LOC buffer: ×{LOC_BUFFER}")
    print()
    print("  ┌────────┬───────────────┬──────────┬─────────┬───────────┐")
    print("  │ ETF    │ Budget (KRW)  │ Price    │ Shares  │ LOC Limit │")
    print("  ├────────┼───────────────┼──────────┼─────────┼───────────┤")

    total_krw = 0
    total_actual_krw = 0
    for r in results:
        total_krw += r["krw_amount"]
        total_actual_krw += r["actual_cost_krw"]
        shares_str = str(r["shares"]) if r["shares"] > 0 else "skip"
        print(
            f"  │ {r['ticker']:<6} │ {r['krw_amount']:>11,}원 │ ${r['price']:>7,.2f} │ {shares_str:>7} │ ${r['loc_limit']:>8,.2f} │"
        )

    print("  └────────┴───────────────┴──────────┴─────────┴───────────┘")
    print()

    remainder = total_krw - total_actual_krw
    print(f"  Budget:    {total_krw:>12,}원")
    print(f"  Spending:  {total_actual_krw:>12,}원")
    print(f"  Remainder: {remainder:>12,}원")
    print()


def main():
    parser = argparse.ArgumentParser(description="LOC share calculator")
    parser.add_argument(
        "--from-report", action="store_true", help="Read from indexergo report"
    )
    parser.add_argument("--date", help="Report date (YYYY-MM-DD)")
    parser.add_argument("--total", type=int, help="Total KRW to invest")
    parser.add_argument(
        "--etfs", help='ETF:pct pairs, e.g. "VOO:60,QQQ:40"'
    )
    parser.add_argument(
        "--amounts", help='ETF:krw pairs, e.g. "SGOV:144589,GLD:857096"'
    )
    parser.add_argument(
        "--buffer",
        type=float,
        default=1.10,
        help="LOC price buffer multiplier (default: 1.10)",
    )
    args = parser.parse_args()

    global LOC_BUFFER
    LOC_BUFFER = args.buffer

    # Determine KRW amounts per ticker
    amounts_krw: dict[str, int] = {}
    source = ""

    if args.amounts:
        # Direct KRW amounts
        for pair in args.amounts.split(","):
            ticker, krw = pair.strip().split(":")
            amounts_krw[ticker.upper()] = int(krw)
        source = "manual amounts"

    elif args.from_report:
        report = get_latest_report(args.date)
        source = f"report: {report.name}"

        # Try action plan first (has KRW amounts)
        amounts_krw = parse_report_action_plan(report) or {}

        # Fallback to percentages + --total
        if not amounts_krw:
            pcts = parse_report_percentages(report)
            if not pcts:
                print("Error: could not parse report", file=sys.stderr)
                sys.exit(1)
            if not args.total:
                print(
                    "Error: report has no action plan. Provide --total (KRW)",
                    file=sys.stderr,
                )
                print(f"  Parsed percentages: {pcts}", file=sys.stderr)
                sys.exit(1)
            for ticker, pct in pcts.items():
                amounts_krw[ticker] = int(args.total * pct / 100)
            source += f" (percentages + total={args.total:,}원)"

    elif args.total and args.etfs:
        # Manual: total + percentages
        for pair in args.etfs.split(","):
            ticker, pct = pair.strip().split(":")
            amounts_krw[ticker.upper()] = int(args.total * int(pct) / 100)
        source = f"manual: {args.total:,}원"

    else:
        parser.print_help()
        sys.exit(1)

    if not amounts_krw:
        print("Error: no buy amounts determined", file=sys.stderr)
        sys.exit(1)

    # Fetch exchange rate and calculate
    print("\n  Fetching USD/KRW rate and ETF prices...")
    exchange_rate = get_exchange_rate()
    results = calculate_shares(amounts_krw, exchange_rate)
    print_results(results, exchange_rate, source)


if __name__ == "__main__":
    main()
