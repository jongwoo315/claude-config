---
name: production-safety-audit
description: Check if code changes are safe for production by auditing AWS infrastructure state and scanning for dangerous code patterns
---

# Production Safety Audit

## Description

새 코드가 프로덕션 인프라에서 안전하게 동작하는지 검증합니다.

**메인:** AWS CLI로 실제 인프라 상태를 조회하여 코드 변경의 영향을 평가
**보조:** 변경 코드 + 의존 모듈에서 위험 패턴 스캔

## How to Invoke

**Primary triggers:**
- `/ops:production-safety-audit`
- "production safety audit"
- "인프라 안전성 체크"
- "프로덕션 안전한지 확인"

**Arguments (optional):**
- `--infra-only`: 코드 패턴 체크 생략, 인프라 상태만 조회
- `--code-only`: 인프라 조회 생략, 코드 패턴만 체크

## Workflow Position

```
dev-workflow Step 9:     verification-before-completion → production-safety-audit → finishing-a-development-branch
github-pr-review Step 3.5: review 실행 → production-safety-audit (--code-only) → 결과 포맷팅
```

독립 호출도 가능 — 기존 코드 점검, 인프라 상태 확인 등.

## Instructions

### Step 0: 프로젝트 감지 & 설정 로드

1. `pwd`로 현재 프로젝트 판단
2. `~/.claude/command-scripts/ops/production-safety-audit/infra/` 에서 매칭되는 yaml 로드
   - yaml의 `path_match` 패턴과 `pwd` 비교
3. yaml이 없으면: "이 프로젝트의 인프라 설정이 없습니다. README를 참고하여 추가하세요." 안내 후 종료

```bash
# 예: pf-server-django.yaml 로드 확인
cat ~/.claude/command-scripts/ops/production-safety-audit/infra/pf-server-django.yaml
```

### Step 1: 코드 변경 분석

1. base branch 대비 변경 파일 목록 수집:

```bash
# base branch 감지
BASE_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "production")
git diff --name-only $BASE_BRANCH...HEAD -- '*.py'
```

2. 변경된 Python 파일의 import 1-depth 추적:
   - 변경 파일에서 `from ... import` / `import ...` 추출
   - 프로젝트 내부 모듈만 추적 (외부 패키지 제외)
   - 이 의존 모듈도 스캔 대상에 포함

3. 코드에서 사용하는 인프라 감지:

| 코드 패턴 | 감지되는 인프라 |
|-----------|----------------|
| `redis`, `get_redis_client`, `Redis(` | Redis |
| `models.`, `objects.filter`, `objects.all`, `migration` | RDS |
| `Elasticsearch`, `es.search`, `es.index` | Elasticsearch |
| `requests.get`, `requests.post`, `urllib`, `httpx` | 외부 API |
| `@shared_task`, `@app.task`, `.delay(` | Celery/Worker |

### Step 2: 인프라 상태 조회 (메인)

**Step 1에서 감지된 인프라에 해당하는 리소스만 조회합니다.**

yaml의 `aws_profile`과 `region`을 사용:

```bash
AWS_PROFILE=<yaml.aws_profile>
AWS_REGION=<yaml.region>
```

#### Redis (ElastiCache)

primary role인 클러스터만 조회:

```bash
# 클러스터 정보 (인스턴스 타입)
aws elasticache describe-cache-clusters \
  --cache-cluster-id <cluster_id> \
  --show-cache-node-info \
  --region $AWS_REGION \
  --query 'CacheClusters[0].[CacheNodeType,NumCacheNodes,EngineVersion]' \
  --output text

# CPU 사용률 (24시간)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name EngineCPUUtilization \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period 3600 --statistics Average,Maximum \
  --start-time $(date -u -v-24H +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --region $AWS_REGION \
  --output json

# CPU 크레딧 (t계열만 — 인스턴스 타입이 t로 시작하면 조회)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CPUCreditBalance \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period 3600 --statistics Average \
  --start-time <24h ago> --end-time <now> \
  --region $AWS_REGION \
  --output json

# 커넥션 수
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CurrConnections \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period 3600 --statistics Average,Maximum \
  --start-time <24h ago> --end-time <now> \
  --region $AWS_REGION \
  --output json
```

**판정 기준:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 인스턴스 타입이 `cache.t*` (burstable) | ⛔ CRITICAL | "프로덕션에 burstable 인스턴스 사용 중. 트래픽 증가 시 CPU 크레딧 고갈 → 성능 절벽 위험" |
| CPU 크레딧 < 30% (t계열) | ⛔ CRITICAL | "CPU 크레딧 고갈 임박 (X%)" |
| EngineCPU 평균 > 40% | ⚠️ HIGH | "Redis CPU 여유 부족 (평균 X%). 새 기능의 추가 부하로 임계점 초과 가능" |
| EngineCPU 최대 > 80% | ⚠️ HIGH | "Redis CPU 스파이크 감지 (최대 X%)" |
| CurrConnections > 5000 | ⚠️ HIGH | "Redis 커넥션 수 높음 (X개)" |

#### RDS (MySQL)

primary role인 인스턴스만 조회:

```bash
# 인스턴스 정보
aws rds describe-db-instances \
  --db-instance-identifier <instance_id> \
  --region $AWS_REGION \
  --query 'DBInstances[0].[DBInstanceClass,Engine,EngineVersion]' \
  --output text

# CPU 사용률
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period 3600 --statistics Average,Maximum \
  --start-time <24h ago> --end-time <now> \
  --region $AWS_REGION \
  --output json

# 커넥션 수
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period 3600 --statistics Average,Maximum \
  --start-time <24h ago> --end-time <now> \
  --region $AWS_REGION \
  --output json

# 메모리
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period 3600 --statistics Average \
  --start-time <24h ago> --end-time <now> \
  --region $AWS_REGION \
  --output json
```

**판정 기준:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 인스턴스 타입이 `db.t*` (burstable) | ⚠️ HIGH | "DB도 burstable 인스턴스" |
| CPU 평균 > 60% | ⚠️ HIGH | "DB CPU 여유 부족 (평균 X%)" |
| CPU 최대 > 90% | ⛔ CRITICAL | "DB CPU 스파이크 (최대 X%)" |
| DatabaseConnections > max_connections 70% | ⛔ CRITICAL | "DB 커넥션 풀 고갈 위험" |
| FreeableMemory < 500MB | ⚠️ HIGH | "DB 메모리 부족 (X MB)" |

#### Elastic Beanstalk

```bash
# 환경 정보
aws elasticbeanstalk describe-environments \
  --environment-names <environment> \
  --region $AWS_REGION \
  --query 'Environments[0].[Status,Health,HealthStatus]' \
  --output text

# Auto Scaling 설정
aws elasticbeanstalk describe-configuration-settings \
  --application-name <application> \
  --environment-name <environment> \
  --region $AWS_REGION \
  --query 'ConfigurationSettings[0].OptionSettings[?Namespace==`aws:autoscaling:asg`]' \
  --output json

# 현재 인스턴스 수
aws elasticbeanstalk describe-environment-resources \
  --environment-name <environment> \
  --region $AWS_REGION \
  --query 'EnvironmentResources.Instances' \
  --output json
```

**판정 기준:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| Health가 Red/Degraded | ⛔ CRITICAL | "현재 환경 불안정 (Health: X)" |
| Health가 Yellow/Warning | ⚠️ HIGH | "환경 경고 상태 (Health: X)" |
| 현재 인스턴스 수 = MinSize | ⚠️ HIGH | "Auto Scaling 여유 없음 (현재 X/X)" |
| 인스턴스 타입이 `t*` | ℹ️ MEDIUM | "EB도 burstable 인스턴스" |

### Step 3: 코드 패턴 체크 (보조)

Step 1에서 수집한 변경 파일 + 의존 모듈을 대상으로 위험 패턴을 grep.

#### Redis 패턴

```bash
# .keys() 사용 (CRITICAL — Redis 싱글스레드 블로킹)
grep -n '\.keys(' <files>

# redis.Redis() 직접 생성 (HIGH — 싱글톤 미사용)
grep -n 'redis\.Redis(' <files>

# timeout 없는 Redis 클라이언트 생성
# redis.Redis() 또는 redis.StrictRedis()에 socket_timeout 파라미터 없음
grep -n 'redis\.\(Redis\|StrictRedis\)(' <files> | grep -v 'socket_timeout'

# try/except 없는 Redis 호출 (HIGH)
# redis 호출이 try 블록 밖에 있는 경우 — 수동 확인 필요 플래그
```

#### 외부 API 패턴

```bash
# requests 호출에 timeout 없음 (CRITICAL)
grep -n 'requests\.\(get\|post\|put\|delete\|patch\)(' <files> | grep -v 'timeout'

# urllib timeout 없음 (HIGH)
grep -n 'urllib\.request\.\(urlopen\|Request\)(' <files> | grep -v 'timeout'
```

#### Celery 패턴

```bash
# time_limit 없는 task (HIGH)
grep -n '@shared_task\|@app\.task' <files> | grep -v 'time_limit'

# 무제한 queryset 루프 (HIGH)
grep -n '\.objects\.all()' <files>
```

#### 기타 패턴

```bash
# bare except (HIGH)
grep -n 'except:' <files>
grep -n 'except Exception.*pass' <files>

# pymysql 직접 사용 (CRITICAL — SQL injection + timeout 미설정)
grep -n 'pymysql\.\(connect\|Connect\)' <files>

# 하드코딩된 시크릿 (CRITICAL)
grep -n 'xoxb-\|xoxp-\|sk_live_\|pk_live_' <files>
```

### Step 4: 리포트 출력

모든 결과를 종합하여 아래 형식으로 출력:

```
═══════════════════════════════════════════════════
  Production Safety Audit — <project>
  <date> KST
═══════════════════════════════════════════════════

📋 코드 변경 요약
  Branch: <head> → <base>
  변경 파일: X개 (Python)
  의존 모듈: Y개 추가 스캔
  감지된 인프라 의존: <Redis, MySQL, ...>

───────────────────────────────────────────────────
⛔ CRITICAL (N)
───────────────────────────────────────────────────

[INFRA] <리소스>: <문제 요약>
  리소스: <id> (<instance_type>)
  메트릭: <수치>
  → <영향 분석>
  → 권장: <조치>

[CODE] <문제 요약>
  <file>:<line> — <코드 스니펫>
  → 의존 모듈: <file>:<line> (해당 시)
  → 권장: <조치>

───────────────────────────────────────────────────
⚠️ HIGH (N)
───────────────────────────────────────────────────

(동일 형식)

───────────────────────────────────────────────────
ℹ️ MEDIUM (N)
───────────────────────────────────────────────────

(동일 형식)

═══════════════════════════════════════════════════
  판정: <결과>
  CRITICAL: N | HIGH: N | MEDIUM: N
═══════════════════════════════════════════════════
```

**판정 기준:**

| 결과 | 조건 |
|------|------|
| ⛔ CRITICAL 이슈 있음 — 수정 또는 확인 필요 | CRITICAL 1개 이상 |
| ⚠️ HIGH 이슈 있음 — 확인 권장 | HIGH만 있음 |
| ✅ OK to proceed | MEDIUM 이하만 |

### Step 5: CRITICAL 이슈 대응

CRITICAL 이슈가 있으면:
1. 각 이슈별 권장 조치를 제시
2. 사용자에게 "수정할까요, 아니면 인지하고 진행할까요?" 확인
3. 수정하면 해당 이슈 재스캔

## Error Handling

| 상황 | 대응 |
|------|------|
| AWS CLI 미설치 | "aws cli가 필요합니다" 안내 |
| AWS 인증 실패 | "aws configure 확인" 안내 |
| yaml 파일 없음 | README 경로 안내 |
| 특정 메트릭 조회 실패 | "⚠️ 조회 실패" 표시, 나머지 계속 진행 |
| git diff 불가 (base branch 없음) | `--code-only` 모드로 전환 제안 |
| 변경 파일 없음 | `--infra-only` 모드로 전환 제안 |

## Configuration

**인프라 설정 파일:** `~/.claude/command-scripts/ops/production-safety-audit/infra/`
**리소스 추가/수정:** 위 디렉토리의 `README.md` 참조
