---
name: dividend-calendar
description: Use when user wants to check ETF dividend schedules, ex-dividend dates, pay dates, and yields for US and Korean ETFs
---

# Dividend Calendar

Fetches ex-dividend dates, pay dates, yields, and frequency for US and Korean (KRX) ETFs.

## When to Use

- User asks about upcoming dividends or ex-dividend dates
- User wants to know dividend yields or payment schedules
- User asks "when is the next dividend?" or "배당 언제?"

## How It Works

```
Tickers → yfinance (price, dividend history) + Nasdaq API (pay dates) → formatted table
```

- Default tickers: ETHU, QLD, JEPQ, GLD, SGOV, 0046A0, 379810, 418660
- Korean tickers (6-char codes like 379810, 0046A0) auto-appended with .KS
- Pay dates from Nasdaq API; fallback: ex-date + 2 business days

## Run the Script

```bash
# Default tickers
python3 ~/.claude/command-scripts/economy/dividend-calendar/fetch.py

# Add extra tickers
python3 ~/.claude/command-scripts/economy/dividend-calendar/fetch.py --add VOO,JEPI,SCHD

# Add Korean tickers
python3 ~/.claude/command-scripts/economy/dividend-calendar/fetch.py --add 0046A0,379810

# Specific tickers only (ignore defaults)
python3 ~/.claude/command-scripts/economy/dividend-calendar/fetch.py --only VOO,JEPI
```

## Execution

1. Run the script with appropriate flags based on user request
2. If user mentions specific tickers, use `--add` or `--only`
3. Present the markdown table output directly to the user
4. Highlight any upcoming ex-dividend dates within the next 2 weeks

## Notes

- **배당락일**: 이 날짜 전에 매수해야 배당 수령 가능
- **배당일**: 실제 배당금 지급일
- **↓ 추정**: 최근 주기 기반 추정치
- **\***: Nasdaq 데이터 없어 배당락일+2영업일로 추정
- Requires `yfinance` and `pandas` packages
