---
name: personal-indexergo-analyzer
description: Use when user wants portfolio analysis based on INDEXerGO macroeconomic indicators, after running indexergo-parser
---

# INDEXerGO Portfolio Analyzer

## Overview

Analyzes macroeconomic indicators from indexergo-parser and provides portfolio allocation recommendations.

## Input

### 1. Macro Indicators (Required)

JSON output from indexergo-parser:
```bash
python3 ~/.claude/command-scripts/economy/indexergo-parser/parse.py --json
```

### 2. Deposit Amount (Optional)

Ask user: "입금 예정 금액이 있나요? (예: 500만원, 300만원)"

**All amounts are in KRW (원).** No currency conversion needed.

### 3. Current Portfolio (Optional)

Ask user: "현재 포트폴리오를 알려주세요. 스크린샷 또는 텍스트 모두 가능합니다."

**Accepted formats:**
- **Screenshot**: Brokerage app screenshot (use Read tool to view image, extract ticker + 원화평가금액)
- **Text input**: Free-form text like "SGOV 300만원, GLD 250만원, QLD 150만원, JEPQ 300만원"
- **Not provided**: Skip to percentage-only recommendation (backward compatible)

**Parsing rules:**
- Extract ticker symbol and 원화평가금액 (KRW market value, not quantity or USD value)
- All values in KRW (원). If screenshot shows USD amounts, use the 원화평가금액 column
- If screenshot shows 예수금 with multiple currencies, sum all 원화평가금액 as deposit
- If screenshot contains tickers not in default portfolio, note them separately as "기타 보유"

## Default Portfolio

| Ticker | Name | Default % | Role |
|--------|------|-----------|------|
| SGOV | iShares 0-3 Month Treasury | 30% | Safe haven, short-term yield |
| GLD | SPDR Gold Shares | 25% | Inflation hedge |
| QLD | ProShares Ultra QQQ (2x) | 15% | Growth, high risk |
| JEPQ | JPMorgan Nasdaq Premium Income | 30% | Income, moderate risk |

## Analysis Framework

### 1. Categorize Indicators

```
FED 지표 (Interest Rates)
├── 장단기금리차 → Yield curve signal
├── 10년 국채 → Long-term rate level
└── 2년 국채 → Short-term rate level

고용 지표 (Employment)
├── 비농업고용 → Job market health
├── 실업률 → Labor slack
└── 신규실업수당 → Leading indicator

인플레이션 지표 (Inflation)
├── CPI → Headline inflation
├── PPI → Producer costs
└── Core PCE → Fed's preferred measure

경기 선행 지표 (Leading)
├── ISM 제조업 PMI → Manufacturing health (50 = neutral)
├── ISM 서비스업 PMI → Services health (50 = neutral)
└── 미시간 소비자심리 → Consumer confidence

통화지표 (Money Supply)
└── M2 → Liquidity conditions
```

### 2. Signal Interpretation

| Indicator | Bullish | Neutral | Bearish |
|-----------|---------|---------|---------|
| 장단기금리차 | > 0.5% | 0 ~ 0.5% | < 0 (inverted) |
| 실업률 MoM | Decreasing | Stable | Increasing |
| CPI YoY | < 2.5% | 2.5-3.5% | > 3.5% |
| ISM Manufacturing | > 52 | 48-52 | < 48 |
| ISM Services | > 52 | 48-52 | < 48 |
| Consumer Sentiment YoY | > 0% | -10% ~ 0% | < -10% |

### 3. Portfolio Adjustment Rules

```
Risk-Off Signals (increase SGOV/GLD, decrease QLD):
- ISM Manufacturing < 48
- Consumer Sentiment YoY < -15%
- Yield curve inverted
- Unemployment rising

Risk-On Signals (increase QLD/JEPQ, decrease SGOV):
- ISM both > 52
- Consumer Sentiment improving
- Inflation < 2.5%
- Strong employment

Inflation Hedge (increase GLD):
- CPI/PCE YoY > 3%
- PPI accelerating
```

### 4. Adjustment Magnitude

| Signal Strength | Adjustment |
|-----------------|------------|
| 1 signal | ±5% |
| 2-3 signals | ±10% |
| 4+ signals | ±15% |

## Output Format

```markdown
## 📊 거시경제 지표 기반 포트폴리오 분석

### 현재 시장 상황 요약
[Table: 영역 | 신호 | 해석]

### 시장 진단
[Positive vs Negative factors]
[Overall assessment]

### 💼 포트폴리오 배분 추천
[Table: Ticker | 기본 | 추천 | 변동 | 근거]

### 현재 포트폴리오 현황 (if current portfolio provided)
[Table: Ticker | 현재 보유 | 현재 비중 | 추천 비중 | 차이]

### 💰 리밸런싱 액션 플랜 (if deposit or current portfolio provided)
입금액: X원
[Table: Ticker | 현재 가치 | 추가 매수 금액 | 투자 후 가치 | 투자 후 비중]

### 티커별 상세 분석
[Reasoning for each ticker]

### ⚠️ 리스크 시나리오
[Table: 시나리오 | 확률 | 대응]

**면책:** 이 분석은 참고용이며, 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.
```

## Action Plan Calculation

When deposit and/or current portfolio are provided:

```
1. Current Total = sum of all current holdings
2. New Total = Current Total + Deposit
3. Per ticker:
   Target Value = New Total × Recommended %
   Action = Target Value - Current Value
   If Action > 0 → 매수 (buy)
   If Action < 0 → 매도 (sell)
   If |Action| < New Total × 1% → 유지 (hold, ignore noise)
```

**Priority: Allocate deposit first, minimize selling.**

If rebalancing requires selling and the user only asked about deposit allocation:
- Show deposit-only allocation as primary recommendation
- Show full rebalancing as optional secondary recommendation

**Deposit-only mode** (no selling):
```
1. Calculate target allocation for New Total
2. Determine gap per ticker (target - current)
3. Allocate deposit proportionally to positive gaps only
4. Show result
```

## Save Report

**IMPORTANT: Always save the analysis report to a markdown file.**

Save location: `~/.claude/data/economy/indexergo-analyzer/reports/`

Filename format: `YYYY-MM-DD.md` (e.g., `2026-01-20.md`)

```bash
# Create reports directory if not exists
mkdir -p ~/.claude/data/economy/indexergo-analyzer/reports
```

If a report for today already exists, overwrite it with the latest analysis.

## Example Analysis Flow

### Example 1: Percentage-Only (no deposit/portfolio)

1. Parse indicators → count signals → recommend percentages
2. SGOV 30%→35%, GLD 25%→25%, QLD 15%→10%, JEPQ 30%→30%

### Example 2: With Deposit + Current Portfolio

**Input:**
- Deposit: 200만원
- Current: SGOV 300만원, GLD 250만원, QLD 150만원, JEPQ 300만원 (합계 1,000만원)
- Recommended: SGOV 35%, GLD 25%, QLD 10%, JEPQ 30%

**Calculation:**
```
New Total = 1,000 + 200 = 1,200만원

Deposit-only mode (매도 없이):
- Positive gaps: SGOV +120, GLD +50, JEPQ +60 = 230만
- Deposit 200만 분배 (gap 비율):

Ticker | 현재   | 추가 매수 금액 | 투자 후 가치 | 투자 후 비중
SGOV   | 300만  | 104만          | 404만        | 33.7%
GLD    | 250만  | 43만           | 293만        | 24.5%
QLD    | 150만  | 0 (초과 보유)  | 150만        | 12.5%
JEPQ   | 300만  | 53만           | 353만        | 29.4%
합계   | 1,000만|                | 1,200만      | 100%
```
