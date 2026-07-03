---
name: datadog-dbm-slow-query
description: Datadog DBM slow query 분석 — count/duration 기준 필터링, 인덱스 필요 여부 판정, MySQL replica EXPLAIN 검증까지 자동화
---

# dbm-slow-query

## Description

Datadog Database Monitoring 메트릭을 수집하여 slow query를 식별하고, 인덱스 추가가 필요한 쿼리를 판정합니다.
MySQL replica의 performance_schema와 information_schema를 교차 검증하여 실제 SQL 텍스트와 테이블 크기를 매핑합니다.

## How to Invoke

- `/ops:dbm-slow-query`
- `/ops:dbm-slow-query --min-count 50 --min-duration 0.5`
- `/ops:dbm-slow-query --days 14`
- "Datadog DBM slow query 분석"
- "인덱스가 필요한 쿼리 찾아줘"

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| --min-count | No | `100` | 최소 주간 실행 횟수 |
| --min-duration | No | `1.0` | 최소 평균 실행 시간 (초) |
| --days | No | `7` | Datadog 메트릭 수집 기간 (일) |
| --top | No | `20` | 상위 N개 쿼리만 표시 |
| --skip-replica | No | `false` | MySQL replica 연결 생략 (Datadog만 사용) |

## Instructions

### Step 0: Environment Check

```bash
# Datadog API keys
echo "DD_API_KEY: ${DD_API_KEY:+set}"
echo "DD_APP_KEY: ${DD_APP_KEY:+set}"
```

Datadog 키가 없으면:
> "`DD_API_KEY` 또는 `DD_APP_KEY`가 설정되지 않았습니다. `~/.zshenv`를 확인해주세요."

### Step 1: Fetch Datadog DBM Metrics

**Time range 계산:**

```bash
DAYS=7  # or from --days parameter
TO_TS=$(date +%s)
FROM_TS=$((TO_TS - DAYS * 86400))
ROLLUP=$((DAYS * 86400))  # 전체 기간을 1개 포인트로 rollup
```

**5개 메트릭을 순차 수집** (각각 query_signature별):

| # | Metric | Unit | Query |
|---|--------|------|-------|
| 1 | count | 횟수 | `sum:mysql.queries.count{*} by {query_signature}.rollup(sum,${ROLLUP})` |
| 2 | total_time | **나노초 (총합)** | `sum:mysql.queries.time{*} by {query_signature}.rollup(sum,${ROLLUP})` |
| 3 | rows_examined | 행 수 | `avg:mysql.queries.rows_examined{*} by {query_signature}.rollup(avg,${ROLLUP})` |
| 4 | select_scan | 횟수 | `sum:mysql.queries.select_scan{*} by {query_signature}.rollup(sum,${ROLLUP})` |
| 5 | no_index_used | 횟수 | `sum:mysql.queries.no_index_used{*} by {query_signature}.rollup(sum,${ROLLUP})` |

**API 호출 패턴:**

```bash
# 파이프를 사용하여 rtk 필터링 우회
curl -s -G "https://api.datadoghq.com/api/v1/query" \
  --data-urlencode "api_key=$DD_API_KEY" \
  --data-urlencode "application_key=$DD_APP_KEY" \
  --data-urlencode "from=$FROM_TS" \
  --data-urlencode "to=$TO_TS" \
  --data-urlencode "query=sum:mysql.queries.count{*} by {query_signature}.rollup(sum,$ROLLUP)" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for s in data.get('series', []):
    sig = [t.split(':',1)[1] for t in s.get('tag_set',[]) if t.startswith('query_signature:')]
    if not sig: continue
    pts = [p[1] for p in s.get('pointlist',[]) if p[1] is not None]
    val = pts[0] if pts else 0
    print(f'{sig[0]}\t{val}')
" > /tmp/dbm_count.tsv
```

각 메트릭을 `/tmp/dbm_{metric}.tsv` (signature\tvalue) 형식으로 저장.
time 메트릭은 `/tmp/dbm_total_time.tsv`로 저장 (avg가 아닌 sum 값).

**IMPORTANT — `mysql.queries.time`은 구간별 총 실행시간 (나노초):**

`avg:mysql.queries.time`은 구간별 총시간의 평균 → 의미 없는 값. 반드시 `sum` 사용.

DBM 콘솔의 "avg latency"와 동일한 값을 얻으려면:
```
avg_duration_seconds = sum(mysql.queries.time) / sum(mysql.queries.count) / 1e9
```

예시 검증:
- signature `c55a15a696e879b`: sum_time=1385.3s, count=1111 → 1385.3/1111 = **1.25s** ✓
- signature `22fe91c00340c1e5`: sum_time=38412s, count=1.26M → 38412/1256348 = **30.6ms** ✓

### Step 2: Merge & Filter

Python 스크립트로 5개 TSV를 병합하고 필터링:

```bash
cat > /tmp/dbm_merge.py << 'PYEOF'
# -*- coding: utf-8 -*-
import sys, json

MIN_COUNT = float(sys.argv[1]) if len(sys.argv) > 1 else 100
MIN_DURATION = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
TOP_N = int(sys.argv[3]) if len(sys.argv) > 3 else 20

def load_tsv(path):
    result = {}
    try:
        with open(path) as f:
            for line in f:
                parts = line.strip().split('\t')
                if len(parts) == 2:
                    result[parts[0]] = float(parts[1])
    except FileNotFoundError:
        pass
    return result

count = load_tsv('/tmp/dbm_count.tsv')
total_time_ns = load_tsv('/tmp/dbm_total_time.tsv')
rows = load_tsv('/tmp/dbm_rows_examined.tsv')
scan = load_tsv('/tmp/dbm_select_scan.tsv')
no_idx = load_tsv('/tmp/dbm_no_index_used.tsv')

all_sigs = set(count.keys()) | set(total_time_ns.keys())

results = []
for sig in all_sigs:
    c = count.get(sig, 0)
    total_ns = total_time_ns.get(sig, 0)
    # avg_duration = sum(total_time) / sum(count) — matches DBM console "avg latency"
    avg_sec = (total_ns / c / 1e9) if c > 0 else 0
    r = rows.get(sig, 0)
    s = scan.get(sig, 0)
    n = no_idx.get(sig, 0)

    if c >= MIN_COUNT and avg_sec >= MIN_DURATION:
        needs_index = s > 0 or n > 0
        results.append({
            'signature': sig,
            'count': c,
            'avg_sec': avg_sec,
            'total_time_sec': total_ns / 1e9,
            'avg_rows': r,
            'select_scan': s,
            'no_index_used': n,
            'needs_index': needs_index,
        })

# Sort by total_time descending (biggest impact first)
results.sort(key=lambda x: -x['total_time_sec'])

json.dump(results[:TOP_N], sys.stdout, indent=2)
PYEOF

python3 /tmp/dbm_merge.py $MIN_COUNT $MIN_DURATION $TOP_N > /tmp/dbm_filtered.json
```

### Step 3: MySQL Replica — Table Sizes

**`--skip-replica` 지정 시 이 단계 생략.**

MySQL replica에 연결하여 `information_schema.TABLES`에서 plab DB의 테이블별 행 수를 조회:

```bash
cat > /tmp/.my.cnf << 'EOF'
[client]
host=plab3-replica.ct9mlhi5xnrs.ap-northeast-2.rds.amazonaws.com
port=3306
user=plab_readonly
password=***REMOVED-CREDENTIAL***
database=plab
EOF
chmod 600 /tmp/.my.cnf

mysql --defaults-extra-file=/tmp/.my.cnf -N -e "
SELECT TABLE_NAME, TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'plab'
  AND TABLE_ROWS > 1000
ORDER BY TABLE_ROWS DESC;
" > /tmp/dbm_table_sizes.tsv

rm -f /tmp/.my.cnf
```

### Step 4: MySQL Replica — performance_schema SQL Text

최근 실행된 쿼리 중 full scan이 의심되는 것들의 실제 SQL 텍스트를 추출:

```bash
cat > /tmp/.my.cnf << 'EOF'
[client]
host=plab3-replica.ct9mlhi5xnrs.ap-northeast-2.rds.amazonaws.com
port=3306
user=plab_readonly
password=***REMOVED-CREDENTIAL***
database=plab
EOF
chmod 600 /tmp/.my.cnf

mysql --defaults-extra-file=/tmp/.my.cnf -N -e "
SELECT
  DIGEST,
  LEFT(DIGEST_TEXT, 500) AS digest_text,
  COUNT_STAR,
  ROUND(AVG_TIMER_WAIT/1e12, 3) AS avg_sec,
  ROUND(SUM_ROWS_EXAMINED/GREATEST(COUNT_STAR,1)) AS avg_rows,
  SUM_SELECT_SCAN,
  SUM_NO_INDEX_USED
FROM performance_schema.events_statements_summary_by_digest
WHERE SCHEMA_NAME = 'plab'
  AND COUNT_STAR > 10
  AND (SUM_SELECT_SCAN > 0 OR SUM_NO_INDEX_USED > 0)
ORDER BY SUM_TIMER_WAIT DESC
LIMIT 30;
" > /tmp/dbm_perf_schema.tsv

rm -f /tmp/.my.cnf
```

**주의:** performance_schema는 MySQL 재시작이나 `TRUNCATE` 후 리셋됨. 데이터가 없을 수 있음.

### Step 5: Correlate & Enrich

Python으로 Datadog 결과 + table sizes + performance_schema SQL을 교차 매핑:

```bash
cat > /tmp/dbm_correlate.py << 'PYEOF'
# -*- coding: utf-8 -*-
import json, sys

# Load filtered Datadog results
with open('/tmp/dbm_filtered.json') as f:
    queries = json.load(f)

# Load table sizes
table_sizes = {}
try:
    with open('/tmp/dbm_table_sizes.tsv') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) == 2:
                table_sizes[parts[0]] = int(parts[1])
except FileNotFoundError:
    pass

# Load performance_schema data
perf_data = []
try:
    with open('/tmp/dbm_perf_schema.tsv') as f:
        for line in f:
            parts = line.strip().split('\t')
            if len(parts) >= 7:
                perf_data.append({
                    'digest': parts[0],
                    'sql': parts[1],
                    'count': int(parts[2]),
                    'avg_sec': float(parts[3]),
                    'avg_rows': int(parts[4]),
                    'select_scan': int(parts[5]),
                    'no_index_used': int(parts[6]),
                })
except FileNotFoundError:
    pass

# Correlate avg_rows with table sizes to estimate target table
sorted_tables = sorted(table_sizes.items(), key=lambda x: x[1], reverse=True)

for q in queries:
    avg_rows = q['avg_rows']

    # Find closest matching table(s) by row count
    candidates = []
    for tname, trows in sorted_tables:
        if trows == 0:
            continue
        ratio = avg_rows / trows if trows > 0 else 999
        if 0.5 <= ratio <= 2.0:  # within 2x of table size
            candidates.append((tname, trows, abs(1 - ratio)))
        elif 0.1 <= ratio <= 10.0:  # looser match
            candidates.append((tname, trows, abs(1 - ratio)))

    candidates.sort(key=lambda x: x[2])
    q['table_candidates'] = [(c[0], c[1]) for c in candidates[:3]]

    # Try to match with performance_schema by avg_rows similarity
    best_match = None
    best_score = float('inf')
    for p in perf_data:
        if p['avg_rows'] == 0:
            continue
        ratio = abs(avg_rows - p['avg_rows']) / max(avg_rows, p['avg_rows'], 1)
        if ratio < best_score and ratio < 0.3:  # within 30% match
            best_score = ratio
            best_match = p

    q['sql_text'] = best_match['sql'] if best_match else None
    q['perf_digest'] = best_match['digest'] if best_match else None

# Output enriched results
json.dump({
    'queries': queries,
    'table_sizes_top20': sorted_tables[:20],
    'perf_schema_count': len(perf_data),
}, sys.stdout, indent=2, ensure_ascii=False)
PYEOF

python3 /tmp/dbm_correlate.py > /tmp/dbm_enriched.json
```

### Step 6: Format & Output Report

**CRITICAL — 리포트는 반드시 Claude 텍스트 출력으로 표시할 것.**
python3 stdout, Read tool 모두 Claude Code UI에서 접혀서("… +N lines") 사용자에게 보이지 않는다.
python3 리포트 스크립트를 만들지 말 것. `/tmp/dbm_enriched.json`을 Read tool로 읽은 후, 아래 마크다운 템플릿에 맞춰 **Claude의 텍스트 응답으로 직접 출력**한다.

**출력 템플릿:**

```markdown
## Datadog DBM Slow Query Analysis

**Period:** {days}d ({start_date} ~ {end_date} KST) | **Filters:** count >= {min_count}, avg >= {min_duration}s

| # | Signature | Count | Avg(s) | Total(s) | Avg Rows | Scan% | NoIdx% | Idx? | Est. Table |
|---|-----------|-------|--------|----------|----------|-------|--------|------|------------|
| 1 | abc123def456... | 12,345 | 2.31 | 28,523 | 8.9M | 100% | 100% | ⛔ | order (10.8M) |
| 2 | ... | ... | ... | ... | ... | ... | ... | ... | ... |

**SQL (performance_schema 매칭):**
- #1: `SELECT ... FROM order WHERE ...`
- #2: (매칭 없음)

**Summary:** {total} slow queries | ⛔ Index needed: {needs_index} | ✅ OK: {ok_count}
```

**컬럼 설명:**

| Column | Content |
|--------|---------|
| Signature | First 16 chars of query_signature |
| Count | 주간 실행 횟수 (comma-formatted) |
| Avg(s) | 평균 실행 시간 (초) |
| Total(s) | 기간 내 총 실행 시간 (초) |
| Avg Rows | 실행당 평균 검사 행 수 |
| Scan% | `select_scan / count × 100`% |
| NoIdx% | `no_index_used / count × 100`% |
| Idx? | ⛔ if scan > 0 or no_index > 0, else ✅ |
| Est. Table | avg_rows ≈ TABLE_ROWS 기반 추정 테이블 |

### Step 7: Optional — EXPLAIN on Replica

After presenting the report, ask:

> "특정 쿼리에 대해 replica에서 EXPLAIN을 실행할까요?
> performance_schema에서 매칭된 SQL이 있는 쿼리만 가능합니다."

If user selects a query with matched SQL:
1. Parse the SQL text from performance_schema
2. Replace `?` placeholders with reasonable test values (based on context)
3. Run `EXPLAIN` on replica
4. Present EXPLAIN output with analysis (type, rows, filtered, Extra)

## Error Handling

| Situation | Response |
|-----------|----------|
| DD keys missing | "`DD_API_KEY`/`DD_APP_KEY` 환경변수 확인 필요" |
| Datadog API error | 에러 메시지 표시, 가능한 원인 안내 |
| MySQL replica 연결 실패 | "replica 연결 실패 — `--skip-replica`로 Datadog 데이터만 사용 가능" |
| performance_schema 비어있음 | "performance_schema에 데이터 없음 (최근 재시작?)" — Datadog 결과만 표시 |
| No queries match filter | "필터 조건에 맞는 쿼리가 없습니다. `--min-count`/`--min-duration` 조정 필요" |
| time metric 계산 오류 | **반드시** `sum(time) / sum(count) / 1e9` 사용. `avg(time)`은 잘못된 값 반환 |

## Cleanup

실행 완료 후 임시 파일 정리:

```bash
rm -f /tmp/dbm_*.tsv /tmp/dbm_*.json /tmp/dbm_*.py /tmp/.my.cnf
```

## Notes

- Datadog DBM 메트릭 retention: ~90일
- `mysql.queries.time` = 구간별 총 실행시간 (나노초). avg_dur = `sum(time) / sum(count) / 1e9`
- performance_schema는 MySQL 인스턴스 재시작 시 리셋됨
- query_signature는 Datadog 고유 해시 (MySQL DIGEST와 다름)
- Datadog API에서 query_signature → SQL 텍스트 직접 매핑 불가 (알려진 제한)
- table size 상관관계는 추정치 (avg_rows ≈ TABLE_ROWS일 때 가장 정확)
- 결과를 Jira 티켓에 코멘트로 남기려면 `/parse:jira`와 연계 가능
