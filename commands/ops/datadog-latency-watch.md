---
name: datadog-latency-watch
description: Personal daily latency check for plab Django service - monitors p50/p95/p99 tail latency patterns and error states
---

# latency-watch

## Description

Runs daily checks on Django service latency and error monitors using `dog` CLI. Designed for personal habit of investigating tail latency patterns. Output shown in Claude response only.

## How to Invoke (Natural Language Triggers)

**Primary triggers:**

- "latency watch"
- "run latency check"
- "daily latency check"
- "check latency"

**Korean triggers:**

- "레이턴시 확인"
- "지연 모니터 확인"
- "오늘 레이턴시 어때"

## Instructions

### Priority 1: Critical Checks (Always Run)

1. **Check triggered monitors in last 24 hours**

   ```bash
   dog event stream "24h" --tags "service:django"
   ```

   - Focus on: Alert triggers, state changes, error spikes
   - Note: Any monitor that went into Alert or Warn state

2. **Check current monitor states**

   - Monitor 180146700: Error monitoring (플랩 Error Monitoring)
   - Monitor 166716148: 5xx errors
   - Monitor 176005015: order_success duplicates

   ```bash
   dog monitor show <monitor_id>
   ```

   - Extract: `overall_state`, `overall_state_modified`

3. **Identify top error-prone endpoints**
   - From event stream, identify which resources/endpoints had most errors
   - List top 5 error resources if any

### Priority 2: Important Checks (When Time Permits)

4. **Check latency monitors**

   - Monitor 166566067: P90 latency anomaly detection
   - Monitor 276977826: p99 latency > 3s (warn) / 5s (critical)
   - Monitor 276977833: p50 latency baseline > 1s (warn) / 2s (critical)

   ```bash
   dog monitor show 166566067
   dog monitor show 276977826
   dog monitor show 276977833
   ```

   - Note: p99만 높고 p50이 정상이면 특정 요청 유형 문제, 둘 다 높으면 전체 부하 문제

5. **Count auth/permission failures**

   - From event stream, count 401/403 errors
   - Look for patterns: `401`, `403`, `auth`, `permission`

6. **Check duplicate payment attempts**
   - Status from monitor 176005015 (already in Priority 1)
   - Any warnings about rate limit breaches

### Priority 3: Infrastructure Health (Weekly or As-Needed)

7. **Infrastructure metrics**

   - Monitor 183261197: RDS CPU utilization
   - Monitor 218538700: RDS storage utilization
   - Monitor 262018812: plab3 RDS free storage < 10%
   - Monitor 177855957: EC2 CPU utilization

   ```bash
   dog monitor show <monitor_id>
   ```

   - Note: Only if in Warn or Alert state

8. **Recent deployment events**
   - From event stream, look for deployment-related events
   - Note: Lambda updates, autoscaling events

## Analysis Guidelines

- **Critical** (🚨): Any monitor in Alert state, >50 errors/5min
- **Warning** (⚠️): Any monitor in Warn state, 10-50 errors/5min
- **Normal** (✅): Monitor in OK/No Data state, <10 errors

## Investigation Log (Warn/Alert 발생 시)

Warn 또는 Alert 상태가 하나라도 있으면, 리포트 출력 후 아래를 반드시 수행:

1. **15분 추적** — APM → Traces에서 해당 시간대 slow trace 확인
   - 어떤 endpoint인지
   - DB 쿼리 / 외부 호출 / GC 중 어디서 시간을 쓰는지

2. **Notion Dev Scraps에 한 줄 기록** (DB ID: `76e9673e-d91b-41b2-9779-c0940040f542`)
   - 아래 템플릿으로 페이지 생성:
   ```
   날짜: YYYY-MM-DD
   현상: [무슨 지표가, 얼마나, 언제]
   추적: [원인으로 추정되는 것]
   가설/조치: [대응 방향]
   ```
   - 예: "p99 on /matches 3x spike on Friday 7PM → DB connection pool exhaustion → pool size 증가 검토"

3. **Claude에게 기록 요청** — 체크 후 이상이 있으면 "Notion에 기록해줘"라고 하면 됨

> 습관의 핵심: "모든 걸 조사"가 아니라 "이상 발견 시 15분 추적 + 한 줄 기록". 그 한 줄이 인터뷰 스토리가 됨.

## Output Format

Generate a **short summary** report in Korean:

```
📊 일일 Datadog 리포트 - {YYYY-MM-DD}

🚨 **긴급** ({count}건)
• [brief description] - (https://app.datadoghq.com/monitors/<id>)
• [brief description] - (https://app.datadoghq.com/monitors/<id>)

⚠️ **주의** ({count}건)
• [brief description] - (https://app.datadoghq.com/monitors/<id>)

✅ **정상** ({count}건)
• [brief summary] - (https://app.datadoghq.com/monitors/<id>)
• [brief summary] - (https://app.datadoghq.com/monitors/<id>)

📈 **특이사항**
• [any notable patterns, trends, or correlations]

---
🔗 [Datadog Dashboard](https://app.datadoghq.com/dashboard)
⏰ 생성: {HH:MM KST}
```

**Format notes:**
- Keep each item to one line maximum
- Focus on actionability
- **Always include monitor URLs** using format: `(https://app.datadoghq.com/monitors/<id>)`
- This creates clickable links for quick access

## Implementation Notes

- Use Datadog REST API (`curl`) — `dog` CLI has permission issues
- If API call fails, note it as "⚠️ 데이터 조회 실패"
- Report language should be in Korean always
- Output directly in Claude response

## Success Criteria

- Report generated in < 30 seconds
- Contains actionable information
- Concise enough to read in < 1 minute
