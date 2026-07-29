---
name: api-status
description: Check current performance of specific API endpoints by feature keyword — shows latency, throughput, error rate snapshot with trend comparison vs last week
---

# api-status

## Description

특정 기능/엔드포인트의 현재 성능 스냅샷 + 트렌드 비교를 확인합니다. 키워드 기반으로 관련 엔드포인트를 찾아 Datadog APM 메트릭을 조회합니다.

## How to Invoke

- `/ops:api-status mypage`
- `/ops:api-status match --window 2h --compare yesterday`
- "마이페이지 API 상태 확인"
- "how is mypage api doing"
- "match API 성능 어때?"
- "check payment api performance"

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| keyword | Yes | - | Feature/app keyword (e.g. `mypage`, `match`, `payment`) |
| --window | No | `4h` | Snapshot window: `1h`, `2h`, `4h`, `8h` |
| --compare | No | `last_week` | Trend baseline: `yesterday`, `last_week` |

## Instructions

### Step 0: Parse Input

1. Extract keyword and optional flags from user input
2. Validate `--window` is one of: `1h`, `2h`, `4h`, `8h`
3. Validate `--compare` is one of: `yesterday`, `last_week`

### Step 1: Resolve Endpoints (3-tier)

Try each tier in order. Stop at the first tier that returns results.

#### Tier 1 — Static config

Read `~/.claude/command-scripts/ops/api-status/endpoints.yaml` and look up the keyword.

```bash
cat ~/.claude/command-scripts/ops/api-status/endpoints.yaml
```

If the keyword exists as a key, use those patterns. Wildcard patterns (e.g. `get_api/v2/mypage/*`) will be used as prefix matches against Datadog resource names.

#### Tier 2 — Code tracing (deploy-perf-report style)

Only available when in the `$PLAB_REPO_SERVER` repository (or can access it).

1. Find the app directory matching the keyword:
   - Check `web/{keyword}/urls.py`
   - Check `api/` files containing the keyword

2. Read `web/plab/urls.py` to find the URL prefix for the app:
   ```
   URL prefix lookup:
     'matchs/'         → web/match/urls.py
     'order/'          → web/order/urls.py
     'stadium-groups/' → web/stadium/urls.py
     'teams/'          → web/team/urls.py
     'manager/'        → web/manager/urls.py
     'cash/'           → web/cash/urls.py
     'league/'         → web/league/urls.py
     'coupon/'         → web/coupon/urls.py
     'products/'       → web/stadium_products/urls.py
     'social-requests/' → web/social_requests/urls.py
   ```

3. Read the app's `urls.py` to get individual URL patterns

4. Convert to Datadog `resource_name` format: `{method}_{prefix}{path}/`
   - For ViewSets, expand to common HTTP methods: `get`, `post`, `put`, `patch`, `delete`
   - For API v2: check `api/urls_v2.py` for router registrations

#### Tier 3 — Dynamic Datadog query (fallback)

Query Datadog for all resource names in the last 4 hours and filter by keyword:

```bash
curl -s -G "https://api.datadoghq.com/api/v1/query" \
  --data-urlencode "api_key=$DD_API_KEY" \
  --data-urlencode "application_key=$DD_APP_KEY" \
  --data-urlencode "from=$(date -v-4H +%s)" \
  --data-urlencode "to=$(date +%s)" \
  --data-urlencode "query=avg:trace.django.request{*} by {resource_name}.rollup(avg,3600)"
```

Extract unique `resource_name` values, filter those containing the keyword (case-insensitive).

**Show matched endpoints to user and ask for confirmation before proceeding.**

#### Resolution failure

If no tier returns results:
```
"'{keyword}'에 매핑되는 엔드포인트를 찾을 수 없습니다.
 endpoints.yaml에 매핑을 추가하거나 정확한 resource_name을 직접 지정해주세요."
```

### Step 2: Calculate Time Windows

```
Current window:  now - window  →  now
Baseline window: (now - window) - shift  →  now - shift
  where shift = 24h (yesterday) or 7d (last_week)
```

Convert to Unix timestamps for Datadog API.

Rollup interval by window size:

| Window | Rollup (seconds) |
|--------|-------------------|
| 1h | 300 |
| 2h | 300 |
| 4h | 600 |
| 8h | 1800 |

### Step 3: Query Datadog Metrics

**Auth from environment variables (`~/.zshenv`):**

```bash
API_KEY="$DD_API_KEY"
APP_KEY="$DD_APP_KEY"
```

**For each resolved endpoint, run these queries for BOTH current and baseline windows:**

```bash
query_dd() {
  curl -s -G "https://api.datadoghq.com/api/v1/query" \
    --data-urlencode "api_key=$API_KEY" \
    --data-urlencode "application_key=$APP_KEY" \
    --data-urlencode "from=$1" \
    --data-urlencode "to=$2" \
    --data-urlencode "query=$3"
}
```

| # | Metric | Query |
|---|--------|-------|
| 1 | Avg latency | `avg:trace.django.request{error:false,resource_name:ENDPOINT}.rollup(avg,ROLLUP)` |
| 2 | P90 latency | `p90:trace.django.request{error:false,resource_name:ENDPOINT}.rollup(avg,ROLLUP)` |
| 3 | P95 latency | `p95:trace.django.request{error:false,resource_name:ENDPOINT}.rollup(avg,ROLLUP)` |
| 4 | Throughput | `sum:trace.django.request.hits{resource_name:ENDPOINT}.rollup(sum,ROLLUP)` |
| 5 | Errors | `sum:trace.django.request.errors{resource_name:ENDPOINT}.rollup(sum,ROLLUP)` |

**For wildcard patterns** (e.g. `get_api/v2/mypage/*`): use `resource_name:get_api/v2/mypage/*` in the query scope. Datadog supports wildcard matching in tag filters.

**Processing each query result:**
- Response has `series[]`, each with `tag_set` containing `resource_name:xxx` and `pointlist[]` of `[timestamp, value]`
- Skip `null` values in pointlist
- Latency values are in **seconds** — multiply by 1000 for milliseconds display

**Request-weighted latency averaging:**

For each endpoint, compute:
```
weighted_latency = Σ(latency_i × hits_i) / Σ(hits_i)
```

Match latency points and throughput (hits) points by timestamp. For intervals with both data, compute `latency × hits`. Sum all and divide by total hits.

For P90/P95: use simple average of non-null points.

### Step 4: Calculate Deltas & Classify

For each endpoint:
```
delta_pct = (current - baseline) / baseline * 100
```

Classification thresholds:

| Metric | Improved (🟢) | Regressed (🔴) | Neutral (⚪) |
|--------|---------------|----------------|--------------|
| Latency (avg/p90/p95) | < -10% (faster) | > +10% (slower) | ±10% |
| Throughput | > +20% (more traffic) | < -20% (less traffic) | ±20% |
| Error rate | < -10% (fewer errors) | > +10% (more errors) | ±10% |

### Step 5: Format & Output Report

**Report format:**

```
═══════════════════════════════════════════════════════════════
  📊 API Status: {keyword}
  Window: {window} ({start_kst}-{end_kst} KST) │ Compare: {compare_label}
═══════════════════════════════════════════════════════════════

  Endpoint                              Avg(ms)      Δ Avg    Δ P90    Δ P95    Reqs     Errs
  ──────────────────────────────────  ──────────  ────────  ───────  ───────  ───────  ───────
  get_api/v2/mypage/profile/             142        -5.2%    -3.1%    -8.4%    2.1k      —
  get_api/v2/mypage/matches/             389       +18.3% 🔴 +22.1% 🔴 +15.6% 🔴  856    3→12 🔴
  post_api/v2/mypage/settings/            67        +2.1%    -1.0%    +0.5%     234      —

  📋 요약
  ─────────────────────────────────────────────────
  🔴 get_api/v2/mypage/matches/ — avg +18.3%, 에러 증가 (3→12)
  ✅ 나머지 2개 엔드포인트 정상

  ℹ️  Resolved via: {tier_used} │ Endpoints: {count}
═══════════════════════════════════════════════════════════════
```

**Table columns:**

| Column | Width | Content |
|--------|-------|---------|
| Endpoint | 40 chars (truncate with `..`) | resource_name |
| Avg(ms) | 10 chars | current avg latency in ms |
| Δ Avg | 8 chars | `{delta}% {emoji}` |
| Δ P90 | 7 chars | `{delta}% {emoji}` |
| Δ P95 | 7 chars | `{delta}% {emoji}` |
| Reqs | 7 chars | current window total requests with `k` suffix |
| Errs | 7 chars | `{baseline}→{current} {emoji}` or `—` if zero |

**Value formatting:**
- Latency: right-aligned, `{value:.0f}` for >=100ms, `{value:.1f}` for <100ms
- Request count: use `k` suffix for thousands (e.g., `1.2k`)
- Percentages: `{value:+.1f}%` (always show sign)
- Delta emoji: 🟢 improved, 🔴 regressed, omit for neutral
- Errs column: `—` when both baseline and current are zero

**Output method:**
- Generate report via Python script written to `/tmp/api_status_report.py`
- **Write the script using Bash `cat <<'PYEOF'` heredoc** — do NOT use the Write tool
- Run the script to produce `/tmp/api_status_report.txt`
- Read the file and present content as text in response message

## Error Handling

| Situation | Response |
|-----------|----------|
| `DD_API_KEY`/`DD_APP_KEY` missing | "`DD_API_KEY` 또는 `DD_APP_KEY` 환경변수가 없습니다. `~/.zshenv`를 확인해주세요." |
| No endpoints resolved (all 3 tiers) | "'{keyword}'에 매핑되는 엔드포인트를 찾을 수 없습니다" |
| Datadog API error | "Datadog API 오류: {message}" |
| No metrics in window | "지정된 시간 범위에 메트릭이 없습니다" |
| Not in $PLAB_REPO_SERVER (Tier 2) | Skip code tracing, proceed to Tier 3 |

## Customization

**Via prompt (runtime):**
- Window size: `--window 2h`
- Comparison period: `--compare yesterday`
- Direct endpoint: pass a full resource_name instead of keyword

**Via editing config:**
- Add/modify keyword mappings: `~/.claude/command-scripts/ops/api-status/endpoints.yaml`

## Notes

- Datadog trace metrics: typically 15 days retention
- All queries use REST API via `curl`
- Time display: UTC → KST (+9h)
- Reuses query patterns and formatting conventions from `ops:deploy-perf-report`
