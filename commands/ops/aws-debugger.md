---
name: aws-debugger
description: AWS 리소스 에러 디버깅 — 파이프라인 실패, 배포 에러, CloudFormation 롤백, RDS 성능 이슈 등의 근본 원인을 추적하고 조치 방법을 제시
---

# ops:aws-debugger

## Description

AWS 리소스의 에러/실패를 추적하여 근본 원인을 분석하고 조치 방법을 제시합니다.
ARN, 리소스 이름, 또는 자연어로 대상을 지정하면 관련 서비스를 체이닝하여 원인을 추적합니다.

## How to Invoke

- `/ops:aws-debugger <ARN 또는 리소스 식별자>`
- `/ops:aws-debugger arn:aws:codepipeline:ap-northeast-2:...:pf-production-pipeline`
- `/ops:aws-debugger Prod-env-1 배포 실패`
- `/ops:aws-debugger plab3 DB 성능 확인`
- "파이프라인 에러 확인해줘"
- "EB 배포 왜 실패했는지 확인"
- "DB 슬로우 쿼리 확인" / "RDS 성능 이슈"

## Instructions

### Step 0: 환경 설정

1. `aws-resource-analyzer` 설정이 있으면 profile/region 재사용:

```bash
# aws-resource-analyzer 설정에서 profile/region 로드 (있으면)
cat ~/.claude/command-scripts/ops/aws-resource-analyzer/resources/*.yaml 2>/dev/null
```

2. 없으면 기본값 사용: `--profile default --region ap-northeast-2`

3. AWS CLI 인증 확인:

```bash
aws sts get-caller-identity --profile $AWS_PROFILE --region $AWS_REGION 2>&1
```

### Step 1: 대상 리소스 판별

사용자 입력에서 리소스 타입을 판별합니다:

| 입력 패턴 | 리소스 타입 |
|-----------|------------|
| `arn:aws:codepipeline:...` | CodePipeline |
| `arn:aws:elasticbeanstalk:...` | Elastic Beanstalk |
| `arn:aws:cloudformation:...` | CloudFormation |
| `arn:aws:rds:...` | RDS |
| 파이프라인 이름 또는 "pipeline" 포함 | CodePipeline |
| EB 환경 이름 또는 "eb", "beanstalk" 포함 | Elastic Beanstalk |
| 스택 이름 또는 "stack", "cloudformation" 포함 | CloudFormation |
| DB 인스턴스 ID 또는 "rds", "db", "mysql", "slow query", "deadlock" 포함 | RDS |
| 모호한 경우 | 사용자에게 확인 |

### Step 2: 리소스 타입별 디버깅

대상 리소스에 맞는 디버깅 워크플로우를 실행합니다.

---

#### 타입: CodePipeline

**2a. 최근 실행 이력 조회:**

```bash
aws codepipeline list-pipeline-executions \
  --pipeline-name <pipeline_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --max-items 5 \
  --query 'pipelineExecutionSummaries[*].{Id:pipelineExecutionId,Status:status,Start:startTime,Trigger:trigger.triggerType,Source:sourceRevisions[0].revisionSummary}' \
  --output json
```

**2b. 실패한 실행의 스테이지/액션 상태 조회:**

```bash
aws codepipeline get-pipeline-state \
  --name <pipeline_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json
```

jq로 각 스테이지의 `latestExecution.status`, `errorDetails` 추출.

**2c. 실패 액션에 따라 관련 서비스로 체이닝:**

| 실패 스테이지 | 체이닝 대상 |
|--------------|------------|
| Source | GitHub/CodeStar 연결 상태 확인 |
| Build | CodeBuild 로그 조회 (아래 참조) |
| Deploy (EB) | → Elastic Beanstalk 디버깅으로 전환 |
| Deploy (ECS) | → ECS 디버깅으로 전환 |
| Deploy (CloudFormation) | → CloudFormation 디버깅으로 전환 |

**2d. CodeBuild 로그 조회 (Build 실패 시):**

```bash
# 빌드 ID 추출
aws codepipeline get-pipeline-state \
  --name <pipeline_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query "stageStates[?stageName=='Build'].actionStates[0].latestExecution.externalExecutionId" \
  --output text

# 빌드 상세
aws codebuild batch-get-builds \
  --ids <build_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'builds[0].{Status:buildStatus,Start:startTime,End:endTime,Phases:phases[?phaseStatus==`FAILED`]}' \
  --output json

# 빌드 로그 (마지막 100줄)
aws codebuild batch-get-builds \
  --ids <build_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'builds[0].logs.{Group:groupName,Stream:streamName}' \
  --output json

aws logs get-log-events \
  --log-group-name <group> \
  --log-stream-name <stream> \
  --limit 100 \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'events[*].message' \
  --output json
```

---

#### 타입: Elastic Beanstalk

**2a. 환경 현재 상태:**

```bash
aws elasticbeanstalk describe-environments \
  --environment-names <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'Environments[0].{Status:Status,Health:Health,HealthStatus:HealthStatus,Version:VersionLabel,Updated:DateUpdated}' \
  --output json
```

**2b. 최근 이벤트 (ERROR/WARN 중심):**

```bash
# 최근 2시간 이벤트
aws elasticbeanstalk describe-events \
  --environment-name <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --start-time <2h_ago_utc> \
  --max-items 50 \
  --query 'Events[*].{Time:EventDate,Severity:Severity,Message:Message}' \
  --output json
```

시간순으로 정렬하여 타임라인 구성. ERROR/WARN 이벤트를 먼저 식별.

**2c. 관련 서비스 체이닝:**

| EB 에러 패턴 | 체이닝 |
|-------------|--------|
| "CloudFormation...UPDATE_ROLLBACK" | → CloudFormation 스택 이벤트 조회 |
| "Auto Scaling group...failed" | → ASG 이벤트 + CloudWatch 메트릭 |
| "instance...unhealthy" | → EC2 인스턴스 상태 + 시스템 로그 |
| "Command failed on instance" | → EB 인스턴스 로그 조회 |

**2d. EB 인스턴스 로그 (배포 실패 시):**

```bash
# 최근 로그 요청
aws elasticbeanstalk request-environment-info \
  --environment-name <environment> \
  --info-type tail \
  --region $AWS_REGION --profile $AWS_PROFILE

# 잠시 대기 후 조회
sleep 5
aws elasticbeanstalk retrieve-environment-info \
  --environment-name <environment> \
  --info-type tail \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'EnvironmentInfo[0].Message' \
  --output text
```

---

#### 타입: CloudFormation

**2a. 스택 상태:**

```bash
aws cloudformation describe-stacks \
  --stack-name <stack_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'Stacks[0].{Status:StackStatus,Reason:StackStatusReason,Updated:LastUpdatedTime}' \
  --output json
```

**2b. 실패 이벤트 조회:**

```bash
aws cloudformation describe-stack-events \
  --stack-name <stack_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query "StackEvents[?ResourceStatus=='UPDATE_FAILED' || ResourceStatus=='CREATE_FAILED' || ResourceStatus=='DELETE_FAILED'].{Time:Timestamp,Resource:LogicalResourceId,Status:ResourceStatus,Reason:ResourceStatusReason}" \
  --output json
```

**2c. 롤백 원인 추적:**

실패한 리소스의 `ResourceStatusReason`에서 구체적 에러 메시지 추출.
중첩 스택이면 하위 스택도 재귀적으로 조회.

---

#### 타입: RDS

`aws-resource-analyzer` 설정에서 DB 인스턴스 ID를 자동으로 참조합니다.
사용자가 인스턴스 ID를 직접 제공하거나 "DB", "mysql" 등 키워드를 사용한 경우에도 동작합니다.

**2a. 인스턴스 현재 상태:**

```bash
aws rds describe-db-instances \
  --db-instance-identifier <instance_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Class:DBInstanceClass,Engine:Engine,Version:EngineVersion,Storage:AllocatedStorage,MultiAZ:MultiAZ,ReadReplica:ReadReplicaSourceDBInstanceIdentifier}' \
  --output json
```

**2b. 최근 RDS 이벤트 (장애, 페일오버, 재시작 등):**

```bash
aws rds describe-events \
  --source-identifier <instance_id> \
  --source-type db-instance \
  --duration 1440 \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'Events[*].{Time:Date,Message:Message,Category:EventCategories[0]}' \
  --output json
```

이벤트 카테고리별 중요도:
- `failover` → ⛔ CRITICAL
- `maintenance`, `notification` → ⚠️ WARNING
- `recovery`, `restoration` → 정보

**2c. CloudWatch 성능 메트릭:**

시간 윈도우는 사건 시점에 맞춘다 (하드코딩 금지):

- **진행 중인 이슈**: 최근 1시간, `PERIOD=300`
- **과거 사건 postmortem** (예: "어제 CPU 부하"): 사건 전후를 포함한 커스텀 윈도우를 직접 계산 (KST-9h=UTC 변환 주의). 긴 윈도우는 `PERIOD=3600`으로 시간별 곡선을 먼저 그려 부하 시작/종료 시각을 식별한 뒤, 필요 시 300초로 세분화

```bash
# 기본값 (진행 중 이슈): 최근 1시간 — postmortem이면 사건 윈도우로 직접 지정
START_TIME=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "1 hour ago" +%Y-%m-%dT%H:%M:%S)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
PERIOD=300

# CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# 커넥션 수
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# 메모리
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Minimum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# 스토리지
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeStorageSpace \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Minimum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# 읽기/쓰기 IOPS
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReadIOPS \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name WriteIOPS \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# Replica lag (replica인 경우만)
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ReplicaLag \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json
```

**2d. Performance Insights — MySQL 성능 심층 분석:**

Performance Insights가 활성화된 경우에만 실행. 먼저 확인:

```bash
aws rds describe-db-instances \
  --db-instance-identifier <instance_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'DBInstances[0].PerformanceInsightsEnabled' \
  --output text
```

활성화 시 (`True`), DbiResourceId를 추출하고 메트릭 조회:

```bash
# DbiResourceId 추출
DBI_RESOURCE_ID=$(aws rds describe-db-instances \
  --db-instance-identifier <instance_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'DBInstances[0].DbiResourceId' \
  --output text)

# 윈도우는 2c와 동일 원칙 (postmortem이면 사건 윈도우 지정)
PI_START=$(date -u -v-1H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "1 hour ago" +%Y-%m-%dT%H:%M:%S)
PI_END=$(date -u +%Y-%m-%dT%H:%M:%S)

# DB Load (Active Sessions) — 가장 핵심 지표
aws pi get-resource-metrics \
  --service-type RDS \
  --identifier $DBI_RESOURCE_ID \
  --metric-queries '[{"Metric":"db.load.avg","GroupBy":{"Group":"db.wait_event_type","Limit":5}}]' \
  --start-time $PI_START --end-time $PI_END \
  --period-in-seconds 300 \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# Top SQL by load
aws pi get-resource-metrics \
  --service-type RDS \
  --identifier $DBI_RESOURCE_ID \
  --metric-queries '[{"Metric":"db.load.avg","GroupBy":{"Group":"db.sql","Limit":10}}]' \
  --start-time $PI_START --end-time $PI_END \
  --period-in-seconds 300 \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json
```

**Top SQL** 결과에서 `db.sql.tokenized_id`와 `db.sql.statement` 추출하여 문제 쿼리 식별.

부하 기여 주체 attribution — wait event / 사용자 / 호스트별 분해:

```bash
for G in db.wait_event db.user db.host; do
  aws pi get-resource-metrics \
    --service-type RDS \
    --identifier $DBI_RESOURCE_ID \
    --metric-queries "[{\"Metric\":\"db.load.avg\",\"GroupBy\":{\"Group\":\"$G\",\"Limit\":7}}]" \
    --start-time $PI_START --end-time $PI_END \
    --period-in-seconds 3600 \
    --region $AWS_REGION --profile $AWS_PROFILE --output json
done
```

**주의:**
- `--period-in-seconds` 유효값은 **1, 60, 300, 3600, 86400 만** 허용. 그 외 값(예: 36000)은 `InvalidArgumentException`
- `db.user`/`db.host` 값은 **해시로 반환됨** (예: `0F57BD74EE...`) — 실명 계정/실제 IP는 slow query log(2h)에서만 확인 가능
- wait event가 `wait/io/table/sql/handler` 지배적이면 테이블 풀스캔 신호

**2e. MySQL 전용 CloudWatch 메트릭 (InnoDB/쿼리):**

MySQL 엔진인 경우 추가 조회:

```bash
# Slow queries
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name SlowQueryCount \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Sum Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# Threads running
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name ThreadsRunning \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# InnoDB row lock waits
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name InnoDBRowLockWaits \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Sum Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# InnoDB row lock time
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name InnoDBRowLockTime \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Sum Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# Deadlocks
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name Deadlocks \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Sum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# Buffer pool hit ratio (Enhanced Monitoring, 있으면)
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name BufferCacheHitRatio \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Minimum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE --output json
```

**2f. RDS 알림 판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 페일오버 이벤트 발생 | ⛔ CRITICAL | "RDS 페일오버 발생" |
| CPU > 90% | ⛔ CRITICAL | "DB CPU 과부하 (X%)" |
| CPU > 70% | ⚠️ HIGH | "DB CPU 높음 (X%)" |
| Slow queries > 5/period | ⚠️ HIGH | "슬로우 쿼리 다수 발생 (X개)" |
| Threads running max > 20 | ⛔ CRITICAL | "Active 스레드 폭증 (X개)" |
| Deadlocks > 0 | ⛔ CRITICAL | "데드락 발생 (X건)" |
| Row lock time max > 500ms | ⛔ CRITICAL | "Row lock 지연 심각 (Xms)" |
| Row lock time max > 100ms | ⚠️ HIGH | "Row lock 지연 (Xms)" |
| Row lock waits > 100/period | ⚠️ HIGH | "Row lock 대기 빈번 (X건)" |
| Connections > 200 | ⚠️ HIGH | "커넥션 수 높음 (X개)" |
| FreeableMemory < 500MB | ⚠️ HIGH | "메모리 부족 (X MB free)" |
| FreeStorageSpace < 10GB | ⛔ CRITICAL | "스토리지 부족 (X GB free)" |
| ReplicaLag > 10s | ⛔ CRITICAL | "복제 지연 심각 (Xs)" |
| ReplicaLag > 3s | ⚠️ HIGH | "복제 지연 (Xs)" |
| Buffer cache hit < 90% | ⚠️ HIGH | "버퍼 풀 히트율 저조 (X%)" |
| DB Load > vCPU 수 | ⛔ CRITICAL | "DB Load가 vCPU 초과 (X > Y)" |

**2g. 관련 서비스 체이닝:**

| RDS 에러 패턴 | 체이닝 |
|--------------|--------|
| 페일오버 → EB/앱 커넥션 에러 | → EB 이벤트 + 앱 로그 확인 |
| 스토리지 full | → 큰 테이블/binlog 확인 (콘솔 링크 제공) |
| 커넥션 고갈 | → EB 인스턴스 수 × 앱 커넥션 풀 크기 산출 |
| Replica lag 증가 | → Primary 쓰기 부하, binlog 확인 |
| DB Load 급증 (PI) | → Top SQL 식별, 실행 계획 분석 권장 |
| CPU 장시간 지속 부하 → 특정 SQL 의심 | → 2h slow log로 실사용자/시작시각/스캔량 확정 |

**2h. Slow Query Log 분석 (문제 쿼리 attribution — PI로 쿼리 식별 후 필수):**

PI Top SQL은 쿼리 텍스트만 준다. **실사용자, 접속 IP, 정확한 실행시간, Rows_examined, 시작 시각**은 slow log에서만 확정된다.

```bash
# 로그 파일 목록 — 반드시 날짜 필터 사용 (필터 없이 나열하면 수백 개 파일 출력 폭탄)
aws rds describe-db-log-files \
  --db-instance-identifier <instance_id> \
  --filename-contains "slowquery/mysql-slowquery.log.<YYYY-MM-DD>" \
  --region $AWS_REGION --profile $AWS_PROFILE --output json

# 대상 파일 다운로드 (파일명 suffix = UTC 시각)
aws rds download-db-log-file-portion \
  --db-instance-identifier <instance_id> \
  --log-file-name "slowquery/mysql-slowquery.log.<YYYY-MM-DD>.<HH>" \
  --starting-token 0 --output text \
  --region $AWS_REGION --profile $AWS_PROFILE > /tmp/slow_<HH>.log
```

**핵심 노하우:**

- 로그 엔트리는 **쿼리 종료 시점**에 기록됨. 장기 실행 쿼리는 **CPU가 떨어진 시각(UTC)의 파일**에 있음 — 부하 시작 시각 파일이 아님
- 쿼리 **시작 시각** = 엔트리의 `SET timestamp=<epoch>` 값 (`# Time:`은 종료 시각). 시작 = 종료 − `Query_time`으로 교차 검증
- 파일명 시간대는 **UTC** (KST−9h)
- `# User@Host:`로 실행 주체 확정 (`u_*` 개인 분석 계정 vs 서비스 계정), `Rows_examined`로 스캔 규모 실측 → PI 해시 한계 보완
- 타임라인 완성 조건: 시작 시각·종료 시각이 CloudWatch CPU 곡선의 부하 시작/해소와 일치하는지 확인

**직접 검증 (선택):** 문제 쿼리 식별 후 replica에 접속해 `SHOW INDEX FROM <table>` / `EXPLAIN <query>`로 인덱스 부재·실행계획 실측. 접속 방법은 `~/.claude/rules/databases.md` 참조.

---

### Step 3: 타임라인 구성

수집한 이벤트를 시간순으로 정렬하여 인과 관계를 파악합니다.

**체이닝 예시:**
- CodePipeline 실패 → Deploy 스테이지 실패 → EB 환경 not Ready → EB Rolling Update 진행 중 → ASG 설정 변경이 원인
- EB 앱 에러 → DB 커넥션 타임아웃 → RDS 페일오버 발생 → 유지보수 윈도우가 원인
- RDS DB Load 급증 → Top SQL 식별 → 인덱스 미사용 풀스캔 쿼리가 원인

관련 서비스 간의 이벤트를 교차 참조하여 근본 원인(root cause)을 도출합니다.

### Step 4: 리포트 출력

```
═══════════════════════════════════════════════════
  AWS Error Debug Report — <resource>
  <date> KST
═══════════════════════════════════════════════════

⛔ 실패 요약
  리소스: <name> (<type>)
  상태: <current_status>
  실패 시간: <timestamp>
  에러: <error_message>

📋 타임라인
  <time> — <event description>
  <time> — <event description>
  <time> — ⛔ <failure event>
  <time> — <consequence>
  ...

───────────────────────────────────────────────────
🔍 근본 원인
───────────────────────────────────────────────────

  <root cause 설명>

  체이닝: <service A> → <service B> → <root cause>

───────────────────────────────────────────────────
🔧 조치 방법
───────────────────────────────────────────────────

  1. <immediate action + command>
  2. <follow-up action>
  3. <prevention recommendation>

───────────────────────────────────────────────────
📦 현재 상태
───────────────────────────────────────────────────

  <current resource status>

═══════════════════════════════════════════════════
```

## Error Handling

| 상황 | 대응 |
|------|------|
| AWS CLI 미설치 | "`aws` CLI가 필요합니다" 안내 후 종료 |
| AWS 인증 실패 | "`aws configure` 확인" 안내 후 종료 |
| 리소스 not found | "리소스를 찾을 수 없습니다. 이름/ARN을 확인하세요" |
| 권한 부족 | "조회 권한이 없습니다" + 필요한 IAM 권한 안내 |
| 실패 이력 없음 | "최근 실패 이력이 없습니다. 현재 상태: <status>" |
| 로그 조회 실패 | "⚠️ 로그 조회 실패" 표시, 콘솔 링크 제공 |
| Performance Insights 비활성화 | CloudWatch 메트릭만으로 분석, PI 활성화 권장 안내 |
| PI `db.user`/`db.host`가 해시값만 반환 | slow query log(2h)에서 실명 계정/IP 확인 |
| RDS 메트릭 데이터 없음 | "메트릭 데이터 없음 (Enhanced Monitoring 미활성화?)" 표시 |
