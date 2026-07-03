---
name: personal-indexergo-parser
description: Use when fetching macroeconomic indicator data from indexergo.com/my dashboard, when user asks for Korean/US economic indicators, or when parsing INDEXerGO data
---

# INDEXerGO Parser

## Overview

Fetches and parses macroeconomic indicators from https://indexergo.com/my using saved session cookies.

## When to Use

- User asks for data from indexergo.com
- Need Korean/US macroeconomic indicators (FED, employment, inflation, etc.)
- User mentions "인덱서고" or "INDEXerGO"

## Cookie Configuration

Cookies are stored in `~/.claude/command-scripts/economy/indexergo-parser/cookies.json`:

```json
{
  "cf_clearance": "...",
  "INDEXerGO_flask_session": "..."
}
```

**Cookie lifetimes:**
- `cf_clearance`: ~30 min to 2 hours (Cloudflare)
- `INDEXerGO_flask_session`: Session or ~31 days (Flask)

## Fetch Command

```bash
COOKIES=$(cat ~/.claude/command-scripts/economy/indexergo-parser/cookies.json)
CF=$(echo "$COOKIES" | jq -r '.cf_clearance')
SESSION=$(echo "$COOKIES" | jq -r '.INDEXerGO_flask_session')

curl -s 'https://indexergo.com/my' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' \
  -H "Cookie: cf_clearance=$CF; INDEXerGO_flask_session=$SESSION"
```

## Parse Script

```bash
python3 ~/.claude/command-scripts/economy/indexergo-parser/parse.py
```

## Handling 403 Forbidden

If curl returns 403 or HTML contains "403 Forbidden":

1. **Ask user for new cookies:**
   ```
   The indexergo.com cookies have expired. Please provide new cookies:
   - cf_clearance: [value]
   - INDEXerGO_flask_session: [value]

   You can get these from your browser's Developer Tools > Application > Cookies.
   ```

2. **Update cookies.json** with the new values

3. **Retry the fetch**

## Output Rules

**IMPORTANT: Show ALL indicators without omission or filtering.**

- Do NOT summarize or select "key" indicators
- Do NOT omit indicators by your judgment
- User asked to see indicators = show ALL of them
- If user wants a summary, they will ask for it

## Output Format

Returns structured data with 5 indicator groups:

| Group | Indicators |
|-------|------------|
| FED 지표 | 장단기금리차, 국채 10년/2년 |
| 고용 지표 | 비농업고용, 실업률, 실업수당, 고용비용지수 |
| 인플레이션 지표 | PPI, CPI, PCE, 근원PCE |
| 경기 선행 지표 | ISM제조업/서비스업 PMI, 미시간소비자심리 |
| 통화지표 | M2 (한국), M2 (미국) |

Each indicator includes: name, English name, category, date, value, unit, and change (DoD/MoM/YoY).

## Quick Reference

```python
# Parse indicator from HTML
pattern = r'''
<div class="d-flex align-items-start">.*?<div class="" >\s*([^<]+)</div>  # Korean name
.*?<div class="mb-0 fst-italic text-xs text-gray-700">\s*(\d{4}\.\d{2}(?:\.\d{2})?)\s*</div>  # Date
.*?<div class="mb-0" style="letter-spacing: \.00625em;" >\s*([\d,.-]+)\s*<span[^>]*>\s*([^<]*)</span>  # Value + Unit
'''
```

## After Parsing: Ask About Analysis

After successfully displaying the indicators, **always ask the user:**

```
지표 데이터를 기반으로 포트폴리오 분석을 진행할까요? (indexergo-analyzer)
```

If user agrees, invoke the `indexergo-analyzer` skill with the parsed data.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using Playwright headless | Site blocks headless browsers; use curl with cookies |
| Missing User-Agent | cf_clearance is tied to User-Agent; always include Chrome UA |
| Expired cookies | Check for 403 response; ask user for fresh cookies |
| Forgetting to ask about analysis | Always offer portfolio analysis after showing indicators |
| Omitting/summarizing indicators | Show ALL indicators; never filter by your judgment |
