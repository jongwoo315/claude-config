---
name: datadog-monitoring-manager
description: Datadog 모니터 생성/조회/관리 — RDS, 애플리케이션, 인프라 모니터를 표준화된 설정으로 관리
---

# datadog-monitoring-manager

## Description

Datadog 모니터를 API로 생성, 조회, 수정, 삭제한다. RDS/애플리케이션/인프라 모니터를 표준화된 네이밍, 태그, 알림 채널로 관리.

## How to Invoke (Natural Language Triggers)

**Primary triggers:**

- "add datadog monitor for ..."
- "create rds storage monitor"
- "datadog monitor 추가"
- "모니터링 추가해줘"
- "list datadog monitors"
- "show monitor status"

**With arguments:**

- "add rds storage monitor for plab3 threshold 15%"
- "create cpu monitor for plab-product-prod warning 70 critical 90"
- "delete monitor 262018812"
- "mute monitor 262018812 for 2h"

## Prerequisites

**Datadog API credentials:** Read from environment variables (`~/.zshenv`)

```bash
export DD_API_KEY=<your-api-key>
export DD_APP_KEY=<your-app-key>
```

**APP key scopes required:** `monitors_read`, `monitors_write`

If `DD_API_KEY`/`DD_APP_KEY` env vars are missing or keys lack permissions, instruct the user:
1. Go to Datadog → Organization Settings → Application Keys
2. Create or edit key with `monitors_read` + `monitors_write` scopes

## Instructions

### Step 0: Parse Credentials

```bash
# DD_API_KEY and DD_APP_KEY are loaded from ~/.zshenv
```

Validate both `$DD_API_KEY` and `$DD_APP_KEY` are non-empty. If missing, show Prerequisites section and stop.

### Step 1: Determine Operation

Parse user intent into one of:

| Operation | Trigger |
|-----------|---------|
| **create** | "add", "create", "추가", "생성" |
| **list** | "list", "show", "조회", "목록" |
| **update** | "update", "modify", "변경", "수정" |
| **delete** | "delete", "remove", "삭제" |
| **mute** | "mute", "silence", "음소거" |
| **unmute** | "unmute", "해제" |

### Step 2: For CREATE — Identify Monitor Type

#### RDS Monitors

| Type | Metric | Default Thresholds |
|------|--------|--------------------|
| **storage** | `aws.rds.free_storage_space` | warn: 20%, critical: 10% |
| **cpu** | `aws.rds.cpuutilization` | warn: 70%, critical: 85% |
| **connections** | `aws.rds.database_connections` | warn: 80% of max, critical: 90% of max |
| **replication-lag** | `aws.rds.replica_lag` | warn: 30s, critical: 60s |
| **read-iops** | `aws.rds.read_iops` | context-dependent |
| **write-iops** | `aws.rds.write_iops` | context-dependent |
| **freeable-memory** | `aws.rds.freeable_memory` | warn: 20%, critical: 10% |

#### Application Monitors

| Type | Metric | Default Thresholds |
|------|--------|--------------------|
| **error-rate** | `trace.django.request.errors` | warn: 5%, critical: 10% |
| **latency-p99** | `trace.django.request.duration.by.resource_service.99p` | warn: 3s, critical: 5s |
| **5xx** | `aws.elb.httpcode_target_5xx` | warn: 10/min, critical: 50/min |

### Step 3: For CREATE — Gather Required Parameters

**Always ask the user for:**
1. **Target resource** — RDS instance identifier, service name, etc.
2. **Monitor type** — from tables above (if not obvious from prompt)

**Use defaults unless user specifies otherwise:**
- Thresholds (from tables above)
- Notification channel: `@slack-개발-datadog-monitoring`
- Evaluation window: `last_15m`
- Renotify interval: 60 min
- Priority: P2

**For RDS storage monitors — auto-detect storage size:**

```bash
aws rds describe-db-instances \
  --db-instance-identifier <INSTANCE_ID> \
  --query 'DBInstances[0].AllocatedStorage' \
  --output text
```

Convert percentage thresholds to bytes: `threshold_bytes = total_gb * percentage * 1073741824`

### Step 4: For CREATE — Build and Execute

**Naming convention:** `[{resource_type}] {instance} {metric_description}`

Examples:
- `[RDS] plab3 Free Storage Space < 10%`
- `[RDS] plab3-replica Replication Lag > 60s`
- `[App] pf-server-django Error Rate > 10%`

**Tag convention:**

```json
["service:pf-server-django", "env:prod", "resource:{type}", "instance:{name}"]
```

**Message template (Korean):**

```
## {instance} {metric_description} Alert

**현재 값:** {{value}}
**임계값:** {{threshold}}

### 조치 사항
1. {action_item_1}
2. {action_item_2}
3. {action_item_3}

@slack-개발-datadog-monitoring
```

**Action items by monitor type:**

| Type | Action Items |
|------|-------------|
| storage | 1. 불필요한 데이터/로그 정리 2. 스토리지 확장 검토 3. slow query log, binary log 확인 |
| cpu | 1. 슬로우 쿼리 확인 2. 커넥션 수 확인 3. 인스턴스 스케일업 검토 |
| connections | 1. 커넥션 풀 설정 확인 2. idle 커넥션 정리 3. max_connections 파라미터 검토 |
| replication-lag | 1. 쓰기 부하 확인 2. 네트워크 상태 확인 3. replica 인스턴스 스펙 검토 |
| freeable-memory | 1. 메모리 사용량 높은 쿼리 확인 2. 버퍼풀 설정 검토 3. 인스턴스 스케일업 검토 |

**API call:**

```bash
curl -s -X POST "https://api.datadoghq.com/api/v1/monitor" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "name": "<name>",
    "type": "metric alert",
    "query": "<query>",
    "message": "<message>",
    "tags": [<tags>],
    "priority": 2,
    "options": {
      "thresholds": { "critical": <critical>, "warning": <warning> },
      "notify_no_data": true,
      "no_data_timeframe": 30,
      "notify_audit": false,
      "renotify_interval": 60,
      "include_tags": true,
      "evaluation_delay": 900
    }
  }'
```

### Step 5: Verify and Report

After creation, display:

```
✅ Monitor Created

| Field | Value |
|-------|-------|
| ID | {id} |
| Name | {name} |
| Query | {query} |
| Warning | {warning_threshold} |
| Critical | {critical_threshold} |
| Notification | @slack-개발-datadog-monitoring |
| URL | https://app.datadoghq.com/monitors/{id} |
```

**Also ask:** "datadog-report 스킬에 이 모니터를 등록할까요?" — if yes, add the monitor ID to `~/.claude/commands/ops/datadog-report.md` Priority 3 infrastructure section.

### Step 6: For LIST

```bash
# List all monitors with specific tags
curl -s -X GET "https://api.datadoghq.com/api/v1/monitor?monitor_tags=service:pf-server-django" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}"
```

Display as table:

| ID | Name | Status | Type | Last Triggered |
|----|------|--------|------|---------------|

### Step 7: For UPDATE / DELETE / MUTE

**Update:**
```bash
curl -s -X PUT "https://api.datadoghq.com/api/v1/monitor/{id}" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{<updated_fields>}'
```

**Delete:**
```bash
curl -s -X DELETE "https://api.datadoghq.com/api/v1/monitor/{id}" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}"
```

**Mute:**
```bash
curl -s -X POST "https://api.datadoghq.com/api/v1/monitor/{id}/mute" \
  -H "Content-Type: application/json" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{"end": <unix_timestamp>}'
```

Always confirm destructive operations (delete, mute) with the user before executing.

## Known RDS Instances

| Instance | Engine | Storage | Class | Notes |
|----------|--------|---------|-------|-------|
| plab3 | MySQL 8.0 | 100 GB | db.m5.4xlarge | Primary |
| plab3-replica | MySQL 8.0 | - | - | Read replica |
| plab-product-prod | PostgreSQL | - | - | 구관사 상품 DB |

Use `aws rds describe-db-instances` to get current specs when creating monitors.

## Existing Monitors Registry

| ID | Name | Type |
|----|------|------|
| 183261197 | RDS CPU utilization | infra |
| 218538700 | RDS storage utilization | infra |
| 262018812 | plab3 RDS free storage < 10% | infra |
| 177855957 | EC2 CPU utilization | infra |
| 180146700 | 플랩 Error Monitoring | app |
| 166716148 | 5xx errors | app |
| 176005015 | order_success duplicates | app |
| 166566067 | P90 latency anomaly | app |

Update this table when creating new monitors.

## Error Handling

| Error | Handling |
|-------|----------|
| `DD_API_KEY`/`DD_APP_KEY` missing | Show Prerequisites section |
| APP key lacks permissions | Guide to Organization Settings → Application Keys |
| AWS CLI fails (for RDS info) | Ask user for storage size manually |
| Monitor creation fails (403) | Check APP key scopes |
| Duplicate monitor | Warn user, show existing monitor, ask to proceed |
| Invalid metric name | Show available metrics table |

## Notes

- `evaluation_delay: 900` (15 min) accounts for AWS CloudWatch metric propagation lag
- `no_data_timeframe: 30` triggers alert if metric stops reporting (integration issue)
- RDS storage metric is in **bytes**, not percentage — always convert
- For RDS replicas, `free_storage_space` may not apply — use `replica_lag` instead
- Default notification goes to `@slack-개발-datadog-monitoring` (개발-datadog-monitoring)
