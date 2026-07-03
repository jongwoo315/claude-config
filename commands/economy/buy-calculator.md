---
name: buy-calculator
description: Use when user wants to calculate how many ETF shares to buy and LOC limit prices - after running indexergo-analyzer or with manual ETF allocation params
---

# Buy Calculator

Calculates share counts and LOC limit prices for US ETF purchases via 미래에셋증권.

## When to Use

- After `indexergo-analyzer` produces a report with 매수 금액
- User asks "how many shares should I buy?"
- User wants LOC order parameters for tonight

## How It Works

```
KRW 매수 금액 → fetch USD/KRW rate + ETF prices → share count + LOC limit
```

- LOC limit = current price x 1.10 (guarantees fill, you pay actual close price)
- Shares = floor(KRW / exchange_rate / ETF_price)

## Run the Script

```bash
# From latest indexergo report (has 추가 매수 금액)
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --from-report

# From specific date report
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --from-report --date 2026-02-09

# Report with percentages only (no action plan) — provide total KRW
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --from-report --total 2000000

# Manual: any ETFs with percentages
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --total 5000000 --etfs "VOO:60,QQQ:40"

# Manual: direct KRW amounts per ticker
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --amounts "SGOV:144589,GLD:857096"

# Custom LOC buffer (default 1.10 = 10%)
python3 ~/.claude/command-scripts/economy/buy-calculator/calc.py --from-report --buffer 1.15
```

## Execution

1. Determine the mode based on user context:
   - If indexergo-analyzer was just run in this session, use `--from-report`
   - If report has no action plan (no deposit), ask for `--total` and use `--from-report --total X`
   - If user provides manual ETFs/amounts, use `--etfs` or `--amounts`
2. Run the script and show the output to the user
3. Remind: "미래에셋 앱에서 LOC 주문 입력 — Shares와 LOC Limit 값을 그대로 사용하세요."

## Report Parsing

Reads from `~/.claude/data/economy/indexergo-analyzer/reports/YYYY-MM-DD.md`:

1. First tries: 리밸런싱 액션 플랜 table for 추가 매수 금액 per ticker
2. Fallback: 포트폴리오 배분 추천 table for recommended percentages (requires --total)

## Notes

- "skip" means budget too small for even 1 share of that ETF
- Remainder shows unspent KRW due to rounding down to whole shares
- Prices fetched live from Yahoo Finance
