---
name: deploy-perf-report
description: Use when checking API performance changes after a production deploy - takes a GitHub PR number, compares Datadog latency/throughput/error metrics before and after merge time
---

# deploy-perf-report

## Description

배포 후 API 성능 변화를 리포트합니다. GitHub PR 번호를 기준으로 머지 시점 전후의 Datadog APM 메트릭을 비교하여, 엔드포인트별 레이턴시/처리량/에러율 변화를 보여줍니다.

## How to Invoke

- `/ops:deploy-perf-report 5789`
- `/ops:deploy-perf-report 5789 --window 4h`
- "PR 5789 배포 성능 리포트"
- "deploy perf report for PR 5789"

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| PR number | Yes | - | GitHub PR number |
| --window | No | 2h | Comparison window: `1h`, `2h`, `4h`, `24h` |
| --min-reqs | No | 10 | Minimum request count to include endpoint in delta analysis |
| --include-errors | No | off | Include error traces in latency calculation. By default, latency metrics only measure successful requests (`error:false`) |

## Instructions

### Step 0: Parse Input & Get PR Details

1. Extract PR number and optional `--window` flag (default `2h`)
2. Fetch PR details:

```bash
gh api repos/myplaycompany/pf-server-django/pulls/{PR_NUMBER}
```

Extract: `title`, `merged_at`, `merge_commit_sha`

3. Fetch changed files:

```bash
gh api repos/myplaycompany/pf-server-django/pulls/{PR_NUMBER}/files --jq '.[].filename'
```

**Validation:**
- `merged_at` must not be null → otherwise: "PR #{N}은 아직 머지되지 않았습니다."
- If merged less than `window` ago → warn: "머지 후 {elapsed} 경과. {window} 데이터 확보 후 실행을 권장합니다." (but proceed if user confirms)

**Time-of-day bias detection:**
Check if the before/after windows cross a peak/off-peak boundary (KST):
- Off-peak: 00:00-07:00, 23:00-24:00
- Ramp-up: 07:00-10:00
- Peak: 10:00-23:00

If before and after windows fall in different traffic zones, add a warning banner at the top of the report:
```
⚠️ 시간대 주의: Before 구간(05:38-07:38 KST, off-peak)과 After 구간(07:38-09:38 KST, ramp-up)의
   트래픽 패턴이 다릅니다. 성능 변화가 배포가 아닌 트래픽 변화에 의한 것일 수 있습니다.
```

### Step 1: Calculate Time Windows

Convert `merged_at` (UTC ISO 8601) to Unix timestamp, then:

| Window | From | To |
|--------|------|----|
| Before | `merged_at - window` | `merged_at` |
| After | `merged_at` | `merged_at + window` |

Rollup interval by window size:

| Window | Rollup (seconds) |
|--------|-------------------|
| 1h | 300 |
| 2h | 300 |
| 4h | 600 |
| 24h | 3600 |

### Step 2: Identify Affected Endpoints

Analyze the **PR diff** to determine which specific endpoints were affected. Do NOT use the full file — only the diff matters.

**Core principle:** Read the PR diff (`patch` field from GitHub API), identify which classes/functions were changed, then trace those to Datadog `resource_name` values.

```bash
# Get diff for each file
gh api repos/myplaycompany/pf-server-django/pulls/{PR_NUMBER}/files \
  --jq '.[] | {filename, patch}'
```

**For each changed file, analyze the diff and trace to endpoints:**

#### 2a. Admin files (`*/admin.py`)

1. Read the diff to identify which admin class(es) were modified
2. For each modified admin class, find which model it registers (look for `@admin.register(ModelName)` above the class, or `model = ModelName` in the class)
3. Each affected model maps to: `{method}_e-to-play/{app_label}/{model_name_lower}/`

**How to identify affected admin classes from a diff:**
- If the diff modifies a method inside `class FooAdmin`, only `Foo` is affected
- If the diff modifies a shared utility class/function (e.g., `NoCountPaginator`), find which admin classes USE it by reading the file for references
- `@admin.register(ModelName)` appears right before the class definition

Example: PR #5789 changed `NoCountPaginator` in `web/payment/admin.py`. Reading the file shows only `MatchApplySettingAdmin` uses `NoCountPaginator` (via `paginator = NoCountPaginator`). So the only affected endpoint is:
- `get_e-to-play/payment/matchapplysetting/`

#### 2b. View/ViewSet files (`*/views*.py`)

1. Read the diff to identify which view classes/functions were modified
2. Read the app's `urls.py` (same directory) to find URL patterns referencing those views
3. Trace the include chain from `web/plab/urls.py` to get the full URL prefix

URL prefix lookup for common apps:
```
web/plab/urls.py includes:
  'matchs/'        → web/match/urls.py
  'order/'         → web/order/urls.py
  'stadium-groups/' → web/stadium/urls.py
  'teams/'         → web/team/urls.py
  'manager/'       → web/manager/urls.py
  'cash/'          → web/cash/urls.py
  'league/'        → web/league/urls.py
  'coupon/'        → web/coupon/urls.py
  'products/'      → web/stadium_products/urls.py
  'social-requests/' → web/social_requests/urls.py
```

#### 2c. API view files (`api/views*.py`, `api/serializers*.py`)

1. Read the diff to identify which viewsets/views were modified
2. Check `api/urls.py` (v1) or `api/urls_v2.py` (v2) for router registrations
3. V1 endpoints: `{method}_api/{path}/`, V2: `{method}_api/v2/{path}/`

For serializer changes: find which views use the changed serializer, then trace to URLs.

#### 2d. Shared/utility code changes

If the diff modifies a shared class, function, or mixin (not a specific view/admin class):
1. Search the **same file** for classes that reference the changed code
2. Then trace those classes to endpoints as in 2a/2b/2c

#### 2e. Model/Service/Task files (`*/models.py`, `*/services.py`, `*/tasks.py`, etc.)

These don't map directly to endpoints. Find views that import from the changed module, then trace those views to endpoints.

#### 2f. Framework-level files (`plab/`, middleware, base classes)

Skip endpoint filtering — report all endpoints sorted by traffic volume.

**Final output:** A list of exact `resource_name` patterns to match in Datadog metrics. If no endpoints could be determined, fall back to reporting top endpoints by traffic.

### Step 3: Query Datadog Metrics

**Auth from environment variables (`~/.zshenv`):**

```bash
API_KEY="$DD_API_KEY"
APP_KEY="$DD_APP_KEY"
```

**Run these queries for BOTH before and after windows:**

```bash
# Helper function
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
| 1 | Avg latency | `avg:trace.django.request{SCOPE} by {resource_name}.rollup(avg,ROLLUP)` |
| 2 | P90 latency | `p90:trace.django.request{SCOPE} by {resource_name}.rollup(avg,ROLLUP)` |
| 3 | P95 latency | `p95:trace.django.request{SCOPE} by {resource_name}.rollup(avg,ROLLUP)` |
| 4 | Throughput | `sum:trace.django.request.hits{*} by {resource_name}.rollup(sum,ROLLUP)` |
| 5 | Errors | `sum:trace.django.request.errors{*} by {resource_name}.rollup(sum,ROLLUP)` |

**SCOPE for latency queries (1-3):**
- Default: `{error:false}` — measures only successful requests (excludes 4xx/5xx error traces that have artificial latency)
- With `--include-errors`: `{*}` — includes all traces

Note: Throughput (4) and Errors (5) always use `{*}` to capture total traffic regardless of the flag.

**Important:** Use `--data-urlencode` for proper encoding. Do NOT concatenate query into URL string.

**Processing each query result:**
- Response has `series[]`, each with `tag_set` containing `resource_name:xxx` and `pointlist[]` of `[timestamp, value]`
- Skip `null` values in pointlist (intervals with no traffic)
- Latency values are in **seconds** — multiply by 1000 for milliseconds display

**Request-weighted latency averaging (important):**

Simple averaging of latency points inflates values because low-traffic intervals (e.g., 1 request at 3am with 10s timeout) get equal weight as high-traffic intervals (e.g., 500 requests at 2pm with 200ms). This causes reported latency to differ significantly from what users observe in real-time.

For each endpoint, compute the weighted average:
```
weighted_latency = Σ(latency_i × hits_i) / Σ(hits_i)
```

To do this:
1. Match latency points and throughput (hits) points by timestamp for each endpoint
2. For each interval with both latency and hits data, compute `latency × hits`
3. Sum all `latency × hits` and divide by total hits

This gives a true average latency experienced by actual users, consistent with what Datadog and browser dev tools show.

For P90/P95: use simple average of non-null points (percentiles can't be meaningfully weighted).

### Step 4: Calculate Deltas & Classify

For each endpoint, compute:

```
delta_pct = (after - before) / before * 100
```

Classification thresholds:

| Metric | Improved (🟢) | Regressed (🔴) | Neutral (⚪) |
|--------|---------------|----------------|--------------|
| Latency (avg/p90/p95) | < -10% (faster) | > +10% (slower) | ±10% |
| Throughput | > +20% (more traffic) | < -20% (less traffic) | ±20% |
| Error rate | < -10% (fewer errors) | > +10% (more errors) | ±10% |

Note: Throughput change is informational, not good/bad. More traffic after deploy could mean a new feature is popular.

**Minimum request filter:** Exclude endpoints where BOTH windows have fewer than `--min-reqs` (default 10) total requests. Low-traffic endpoints produce noisy percentage swings (e.g., 1ms→9ms on 2 requests = "+800%") that obscure real changes.

### Step 5: Format & Output Report

**Scope:** Only show PR-related endpoints (from Step 2 mapping). Do NOT include unrelated endpoints — system-wide latency fluctuations are noise, not signal.

**Report format — table layout:**

```
  Endpoint                                      Avg(ms)        Δ Avg       Δ P90       Δ P95       Reqs(B→A)       Errs
  ────────────────────────────────────────  ───────────────  ──────────  ──────────  ──────────  ─────────────  ──────────
  get_matchs/                                    527→   480    -8.9%       -5.9%       -6.3%       1.2k→ 1.3k      —
  post_order/.../apply/                          468→   406   -13.3% 🟢   -17.4% 🟢   -67.3% 🟢     391→  305      —
```

Note: `Reqs(B→A)` = total request count in each window (Before merge → After merge). Used for request-weighted latency and as a traffic indicator.

**Table columns:**

| Column | Width | Content |
|--------|-------|---------|
| Endpoint | 40 chars (truncate with `..`) | resource_name |
| Avg(ms) | 15 chars | `{before} → {after}` in ms |
| Δ Avg | 10 chars | `{delta}% {emoji}` |
| Δ P90 | 10 chars | `{delta}% {emoji}` |
| Δ P95 | 10 chars | `{delta}% {emoji}` |
| Reqs(B→A) | 13 chars | Total request count `{before}→{after}` with `k` suffix. B=Before merge window, A=After merge window |
| Errs | 10 chars | `{before}→{after} {emoji}` or `—` if zero |

**Full report structure:**

```
═══════════════════════════════════════════════════════════════════════
  📊 Deploy Performance Report
  PR #{N}: {title}
  Merged: {merged_at in KST} │ Window: {window} │ Min reqs: {min_reqs}
═══════════════════════════════════════════════════════════════════════

  🎯 PR 관련 엔드포인트  (Changed: {files})
  [table: PR-matched endpoints sorted by |Δ avg|]

  📋 요약
  ───────────────────────────────────────────────────────
  [per-endpoint summary with verdict]

  ℹ️  {n} endpoints filtered (< {min_reqs} reqs)
═══════════════════════════════════════════════════════════════════════
```

**Value formatting:**
- Latency: right-aligned, `{value:.0f}` for ≥100ms, `{value:.1f}` for <100ms
- Request count: use `k` suffix for thousands (e.g., `1.2k`)
- Percentages: `{value:+.1f}%` (always show sign)
- Delta emoji: 🟢 improved (< -10%), 🔴 regressed (> +10%), omit for neutral
- Errs column: show `—` when both before and after are zero

**Output method:**
- Generate the report using a Python script written to `/tmp/gen_report.py`
- **Write the script using Bash `cat <<'PYEOF'` heredoc** — do NOT use the Write tool, which displays the full diff to the user. The script is an internal implementation detail and should not be shown.
- Run the script to produce `/tmp/deploy_perf_report.txt`
- Then read the file and present the content as text in your response message
- Do NOT rely on Bash stdout display — the CLI collapses long Bash outputs into "Read 1 file (ctrl+o to expand)" which hides the report

## Error Handling

| Situation | Response |
|-----------|----------|
| PR not found | "PR #{N} not found in myplaycompany/pf-server-django" |
| PR not merged | "PR #{N}은 아직 머지되지 않았습니다." |
| `DD_API_KEY`/`DD_APP_KEY` missing | "`DD_API_KEY` 또는 `DD_APP_KEY` 환경변수가 없습니다. `~/.zshenv`를 확인해주세요." |
| Datadog API error | "Datadog API 오류: {message}" |
| No metrics in window | "지정된 시간 범위에 메트릭이 없습니다. 배포가 너무 오래되었거나 최근일 수 있습니다." |
| Merge too recent | Warning + proceed (see Step 0) |

## Notes

- Datadog trace metrics: typically 15 days retention
- All queries use REST API via `curl` (`dog` CLI only supports `metric post`)
- Time display: UTC → KST (+9h)
- Resource file reference: `~/.claude/command-scripts/ops/aws-resource-analyzer/resources/pf-server-django.yaml`
