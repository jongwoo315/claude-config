#!/usr/bin/env python3
"""
ETF Dividend Calendar — fetches ex-dividend dates, pay dates, and yields.

Supports both US and Korean (KRX) tickers.
Korean tickers: 6-char codes like 379810, 0046A0 → auto-appended with .KS

Data sources:
  - yfinance: price, dividend history, ex-dates
  - Nasdaq API: pay dates (Nasdaq-listed US ETFs)
  - Fallback: estimated pay date = ex-date + 2 business days

Usage:
  python fetch.py                              # Default tickers
  python fetch.py --add VOO,JEPI,SCHD         # Add US tickers
  python fetch.py --add 0046A0,379810          # Add Korean tickers
  python fetch.py --only VOO,JEPI             # Specific tickers only
"""

import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from urllib.request import urlopen, Request
from urllib.error import URLError

try:
    import yfinance as yf
    import pandas as pd
except ImportError:
    print("ERROR: yfinance, pandas 패키지가 필요합니다.")
    sys.exit(1)

DEFAULT_TICKERS = ["ETHU", "QLD", "JEPQ", "GLD", "SGOV", "0046A0", "379810", "418660"]

# Pattern for Korean ticker codes (6 chars: digits + optional A-F hex-like)
KR_TICKER_RE = re.compile(r"^[0-9A-F]{6}$", re.IGNORECASE)

NASDAQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

# Display names for Korean ETFs
KR_NAMES = {
    "0046A0": "TIGER 미국초단기국채",
    "379810": "KODEX 미국나스닥100TR",
    "418660": "TIGER 미국나스닥100레버리지",
}


def is_kr_ticker(ticker: str) -> bool:
    """Check if ticker is a Korean stock code."""
    raw = ticker.replace(".KS", "").replace(".KQ", "")
    return bool(KR_TICKER_RE.match(raw))


def to_yf_ticker(ticker: str) -> str:
    """Convert raw ticker to yfinance-compatible format."""
    if is_kr_ticker(ticker) and ".K" not in ticker:
        return f"{ticker}.KS"
    return ticker


def display_ticker(ticker: str) -> str:
    """Return human-friendly display name."""
    raw = ticker.replace(".KS", "").replace(".KQ", "")
    name = KR_NAMES.get(raw.upper())
    if name:
        return f"{raw}({name})"
    return raw


def currency_symbol(ticker: str) -> str:
    return "₩" if is_kr_ticker(ticker) else "$"


def add_business_days(start_date, days: int):
    """Add business days to a date (skip weekends)."""
    current = start_date
    added = 0
    while added < days:
        current += timedelta(days=1)
        if current.weekday() < 5:
            added += 1
    return current


def fetch_nasdaq_pay_dates(ticker: str) -> dict[str, str]:
    """Fetch pay dates from Nasdaq API. Returns {ex_date_str: pay_date_str}."""
    if is_kr_ticker(ticker):
        return {}
    url = f"https://api.nasdaq.com/api/quote/{ticker}/dividends?assetclass=etf"
    req = Request(url, headers=NASDAQ_HEADERS)
    try:
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        rows = data.get("data", {}).get("dividends", {}).get("rows") or []
        result = {}
        for r in rows:
            ex = r.get("exOrEffDate", "")
            pay = r.get("paymentDate", "")
            if ex and pay:
                try:
                    ex_dt = datetime.strptime(ex, "%m/%d/%Y").strftime("%Y-%m-%d")
                    pay_dt = datetime.strptime(pay, "%m/%d/%Y").strftime("%Y-%m-%d")
                    result[ex_dt] = pay_dt
                except ValueError:
                    pass
        return result
    except (URLError, json.JSONDecodeError):
        return {}


def infer_frequency(avg_days: float) -> str:
    if avg_days <= 0:
        return "-"
    if avg_days < 45:
        return "월배당"
    if avg_days < 100:
        return "분기배당"
    if avg_days < 210:
        return "반기배당"
    if avg_days < 400:
        return "연배당"
    return "-"


def fetch_dividend_info(ticker_input: str) -> dict:
    """Fetch dividend data for a single ticker."""
    yf_ticker = to_yf_ticker(ticker_input)
    display = display_ticker(ticker_input)
    cur = currency_symbol(ticker_input)

    try:
        t = yf.Ticker(yf_ticker)
    except Exception as e:
        return {"ticker": display, "currency": cur, "error": str(e)[:40]}

    # Price
    try:
        price_val = t.fast_info.last_price
        if is_kr_ticker(ticker_input):
            price = f"{int(price_val):,}"
        else:
            price = f"{price_val:.2f}"
    except Exception:
        price = "N/A"

    # Dividend history
    try:
        divs = t.dividends
    except Exception:
        divs = None

    if divs is None or divs.empty:
        return {
            "ticker": display, "currency": cur, "price": price,
            "last_ex_date": "-", "last_pay_date": "-",
            "last_amount": "-", "annual_dividend": "-",
            "dividend_yield": "-", "frequency": "배당 없음",
            "next_ex_estimate": "-", "next_pay_estimate": "-",
        }

    # Nasdaq pay dates (US only)
    nasdaq_pay = fetch_nasdaq_pay_dates(ticker_input)

    # Last ex-dividend
    last_ex = divs.index[-1]
    last_ex_str = last_ex.strftime("%Y-%m-%d")

    if is_kr_ticker(ticker_input):
        last_amount = f"{int(divs.iloc[-1]):,}"
    else:
        last_amount = f"{divs.iloc[-1]:.4f}"

    # Pay date
    last_pay_str = nasdaq_pay.get(last_ex_str)
    pay_estimated = False
    if not last_pay_str:
        est = add_business_days(last_ex, 2)
        last_pay_str = est.strftime("%Y-%m-%d")
        pay_estimated = True

    # Annual dividend
    one_year_ago = last_ex - pd.Timedelta(days=365)
    recent = divs[divs.index >= one_year_ago]
    annual_div = recent.sum()
    if is_kr_ticker(ticker_input):
        annual_div_str = f"{int(annual_div):,}"
    else:
        annual_div_str = f"{annual_div:.2f}"

    # Yield
    try:
        p = float(price.replace(",", ""))
        div_yield = f"{(annual_div / p) * 100:.2f}%"
    except (ValueError, ZeroDivisionError):
        div_yield = "-"

    # Frequency + next estimates
    freq = "-"
    next_ex_est = "-"
    next_pay_est = "-"
    if len(divs) >= 3:
        recent_divs = divs.tail(6)
        diffs = recent_divs.index.to_series().diff().dropna()
        avg_days = diffs.dt.days.mean()
        freq = infer_frequency(avg_days)
        next_ex = last_ex + pd.Timedelta(days=int(avg_days))
        next_ex_est = next_ex.strftime("%Y-%m-%d")
        next_pay = add_business_days(next_ex, 2)
        next_pay_est = next_pay.strftime("%Y-%m-%d")

    return {
        "ticker": display,
        "currency": cur,
        "price": price,
        "last_ex_date": last_ex_str,
        "last_pay_date": f"{last_pay_str}{'*' if pay_estimated else ''}",
        "last_amount": last_amount,
        "annual_dividend": annual_div_str,
        "dividend_yield": div_yield,
        "frequency": freq,
        "next_ex_estimate": next_ex_est,
        "next_pay_estimate": next_pay_est,
    }


def format_table(results: list[dict]) -> str:
    """Format results as a markdown table."""
    lines = []
    lines.append(f"## ETF 배당 캘린더 ({datetime.now().strftime('%Y-%m-%d')})\n")

    headers = [
        "티커", "현재가", "최근 배당락일", "최근 배당일",
        "배당금", "연간 배당", "수익률", "주기",
        "다음 배당락일↓", "다음 배당일↓",
    ]
    keys = [
        "ticker", "price", "last_ex_date", "last_pay_date",
        "last_amount", "annual_dividend", "dividend_yield", "frequency",
        "next_ex_estimate", "next_pay_estimate",
    ]

    rows = []
    for r in results:
        if "error" in r:
            rows.append([r["ticker"], "ERROR"] + ["-"] * 8)
        else:
            cur = r.get("currency", "$")
            row = []
            for k in keys:
                val = str(r.get(k, "-"))
                if k in ("price", "last_amount", "annual_dividend") and val not in ("-", "N/A", "ERROR"):
                    val = f"{cur}{val}"
                row.append(val)
            rows.append(row)

    col_widths = [
        max(len(h), max((len(row[i]) for row in rows), default=0))
        for i, h in enumerate(headers)
    ]

    def pad_row(cells):
        return "| " + " | ".join(c.ljust(w) for c, w in zip(cells, col_widths)) + " |"

    lines.append(pad_row(headers))
    lines.append("|" + "|".join("-" * (w + 2) for w in col_widths) + "|")
    for row in rows:
        lines.append(pad_row(row))

    lines.append("")
    lines.append("> **배당락일**: 이 날짜 전에 매수해야 배당 수령 가능  ")
    lines.append("> **배당일**: 실제 배당금 지급일  ")
    lines.append("> **↓ 추정**: 최근 주기 기반 추정치  ")
    lines.append("> **\\***: Nasdaq 데이터 없어 배당락일+2영업일로 추정")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="ETF Dividend Calendar")
    parser.add_argument("--add", type=str, help="추가 티커 (쉼표 구분, e.g. VOO,JEPI,0046A0)")
    parser.add_argument("--only", type=str, help="지정 티커만 조회 (기본 목록 무시)")
    args = parser.parse_args()

    if args.only:
        tickers = [t.strip().upper() for t in args.only.split(",") if t.strip()]
    else:
        tickers = list(DEFAULT_TICKERS)
        if args.add:
            extras = [t.strip().upper() for t in args.add.split(",") if t.strip()]
            for t in extras:
                if t not in tickers:
                    tickers.append(t)

    results = [fetch_dividend_info(ticker) for ticker in tickers]
    print(format_table(results))


if __name__ == "__main__":
    main()
