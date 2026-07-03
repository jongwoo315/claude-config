---
name: aws-resource-analyzer
description: AWS 리소스 상태 조회, 메트릭 분석, 변경 영향 평가를 위한 범용 스킬. Monitor 모드(일상 리포트)와 Analyze 모드(변경 전 영향 분석)를 지원.
---

# ops:aws-resource-analyzer

## Description

AWS 리소스의 CloudWatch 메트릭을 수집하여 건강 상태를 리포트하거나, 설정 변경 전 데이터 기반 영향 분석을 수행합니다.

**두 가지 모드:**
- **Monitor**: 전체 리소스 현황 + 건강 상태 리포트
- **Analyze**: 특정 변경 사항의 영향 분석 (시뮬레이션)

## How to Invoke

**Monitor 모드:**
- `/ops:aws-resource-analyzer`
- "AWS 리소스 상태 확인"
- "인프라 현황 리포트"

**Analyze 모드:**
- `/ops:aws-resource-analyzer --analyze "EC2 최소 4→3대"`
- "EC2 인스턴스 줄이면 안전한지 분석해줘"
- "RDS 타입 변경 영향 분석"

**PR Migration 충돌 감지:**
- `/ops:aws-resource-analyzer --pr 6021`
- "PR #6021 migration 충돌 확인해줘"

**옵션:**

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--analyze "..."` | (없으면 monitor) | 변경 영향 분석 모드 |
| `--minutes N` | monitor=15 | Monitor 모드 메트릭 수집 기간 (분 단위, 예: 60=1시간, 1440=1일) |
| `--days N` | analyze=7 | Analyze 모드 메트릭 수집 기간 (일 단위) |
| `--resource TYPE` | 전체 | 특정 타입만 조회 (ec2-asg, rds, elasticache, elasticbeanstalk) |
| `--pr N` | (없으면 로컬) | GitHub PR 번호 기반 migration 충돌 감지 (원격 브랜치 vs production 비교) |

## Instructions

### Step 0: 프로젝트 감지 & 설정 로드

1. `pwd`로 현재 프로젝트 판단
2. `~/.claude/command-scripts/ops/aws-resource-analyzer/resources/` 에서 매칭 YAML 로드
   - YAML의 `path_match` 패턴과 `pwd` 비교
3. `~/.claude/command-scripts/ops/aws-resource-analyzer/thresholds.yaml` 로드
4. YAML 없으면: "이 프로젝트의 리소스 설정이 없습니다." + README 경로 안내 후 종료

```bash
# 설정 확인
ls ~/.claude/command-scripts/ops/aws-resource-analyzer/resources/
cat ~/.claude/command-scripts/ops/aws-resource-analyzer/thresholds.yaml
```

5. AWS CLI 사용 가능 확인:

```bash
aws sts get-caller-identity --profile <yaml.aws_profile> --region <yaml.region> 2>&1
```

실패 시 안내 후 종료.

### Step 1: 모드 판별

- `--analyze` 인자가 있으면 → **Analyze 모드** (Step 10으로)
- `--pr N` 인자가 있으면 → **PR Migration 감지 모드** (Git Migration 파일 충돌 감지 > PR 모드로 직행, AWS 메트릭 수집 스킵)
- 없으면 → **Monitor 모드** (Step 2로)

---

## Monitor 모드

### Step 2: 리소스별 메트릭 수집

YAML의 `resources` 배열을 순회하며, 각 리소스 타입에 맞는 AWS CLI 명령어로 메트릭을 수집합니다.

공통 변수:

```bash
AWS_PROFILE=<yaml.aws_profile>
AWS_REGION=<yaml.region>
# Monitor 모드: --minutes 옵션 또는 기본값 15분
MINUTES=<--minutes 옵션 또는 기본값 15>
START_TIME=$(date -u -v-${MINUTES}M +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "${MINUTES} minutes ago" +%Y-%m-%dT%H:%M:%S)
END_TIME=$(date -u +%Y-%m-%dT%H:%M:%S)
# Period 자동 결정: ≤60분→300s(5분), ≤360분→900s(15분), 그 외→3600s(1시간)
if [ $MINUTES -le 60 ]; then PERIOD=300
elif [ $MINUTES -le 360 ]; then PERIOD=900
else PERIOD=3600; fi
```

**참고:** CloudWatch 메트릭은 기본 5분 해상도. 데이터포인트가 없으면 범위를 자동 확장합니다.

`--resource TYPE` 옵션이 있으면 해당 타입만 수집.

#### 타입: ec2-asg

```bash
# ASG 현재 상태
aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names <asg_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'AutoScalingGroups[0].{Min:MinSize,Max:MaxSize,Desired:DesiredCapacity,Instances:Instances[*].InstanceId}' \
  --output json

# 스케일링 정책
aws autoscaling describe-policies \
  --auto-scaling-group-name <asg_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'ScalingPolicies[*].{Name:PolicyName,Type:PolicyType,Target:TargetTrackingConfiguration}' \
  --output json

# CPU (ASG 전체)
aws cloudwatch get-metric-statistics \
  --namespace AWS/EC2 \
  --metric-name CPUUtilization \
  --dimensions Name=AutoScalingGroupName,Value=<asg_name> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# 스케일링 이벤트
aws autoscaling describe-scaling-activities \
  --auto-scaling-group-name <asg_name> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --max-items 50 \
  --output json
```

**판정 (thresholds.yaml 참조):**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| CPU 평균 > `cpu_avg_warning` | ⚠️ HIGH | "CPU 여유 부족 (평균 X%)" |
| CPU 피크 > `cpu_avg_critical` | ⛔ CRITICAL | "CPU 스파이크 (최대 X%)" |
| 현재 인스턴스 = MinSize | ⚠️ HIGH | "스케일링 여유 없음 (현재=최소)" |
| 스케일링 이벤트 > `scaling_events_per_day_warning`/일 | ⚠️ HIGH | "빈번한 스케일링 (X회/일). 정책 검토 권장" |

#### 타입: rds

```bash
# 인스턴스 정보
aws rds describe-db-instances \
  --db-instance-identifier <instance_id> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'DBInstances[0].{Class:DBInstanceClass,Engine:Engine,Version:EngineVersion,Storage:AllocatedStorage}' \
  --output json

# CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# 커넥션 수
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name DatabaseConnections \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# 메모리
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name FreeableMemory \
  --dimensions Name=DBInstanceIdentifier,Value=<instance_id> \
  --period $PERIOD --statistics Average Minimum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json
```

**판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 인스턴스 타입 `db.t*` | ⚠️ HIGH | "burstable 인스턴스 사용 중" |
| CPU 평균 > `cpu_avg_warning` | ⚠️ HIGH | "DB CPU 여유 부족 (평균 X%)" |
| CPU 최대 > `cpu_avg_critical` | ⛔ CRITICAL | "DB CPU 스파이크 (최대 X%)" |
| Connections > max_connections × `connections_warning_pct`% | ⛔ CRITICAL | "커넥션 풀 고갈 위험 (X/Y)" |
| FreeableMemory < `freeable_memory_warning_mb` MB | ⚠️ HIGH | "메모리 부족 (X MB free)" |

#### 타입: elasticache

```bash
# 클러스터 정보
aws elasticache describe-cache-clusters \
  --cache-cluster-id <cluster_id> \
  --show-cache-node-info \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'CacheClusters[0].{Type:CacheNodeType,Nodes:NumCacheNodes,Version:EngineVersion}' \
  --output json

# EngineCPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name EngineCPUUtilization \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# 커넥션
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CurrConnections \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period $PERIOD --statistics Average Maximum \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json

# CPU 크레딧 (t계열만 — 인스턴스 타입이 cache.t로 시작하면 조회)
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name CPUCreditBalance \
  --dimensions Name=CacheClusterId,Value=<cluster_id> \
  --period $PERIOD --statistics Average \
  --start-time $START_TIME --end-time $END_TIME \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json
```

**판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 인스턴스 타입 `cache.t*` | ⛔ CRITICAL | "burstable 인스턴스. CPU 크레딧 고갈 위험" |
| CPU 크레딧 < `credit_balance_critical_pct`% (t계열) | ⛔ CRITICAL | "CPU 크레딧 고갈 임박 (X%)" |
| EngineCPU 평균 > `cpu_avg_warning` | ⚠️ HIGH | "Redis CPU 여유 부족 (평균 X%)" |
| EngineCPU 최대 > `cpu_avg_critical` | ⛔ CRITICAL | "Redis CPU 스파이크 (최대 X%)" |
| Connections > `connections_warning` | ⚠️ HIGH | "커넥션 수 높음 (X개)" |

#### 타입: elasticbeanstalk

```bash
# 환경 상태
aws elasticbeanstalk describe-environments \
  --environment-names <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'Environments[0].{Status:Status,Health:Health,HealthStatus:HealthStatus}' \
  --output json

# Auto Scaling 설정
aws elasticbeanstalk describe-configuration-settings \
  --application-name <application> \
  --environment-name <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query "ConfigurationSettings[0].OptionSettings[?Namespace=='aws:autoscaling:asg']" \
  --output json

# 현재 인스턴스 수
aws elasticbeanstalk describe-environment-resources \
  --environment-name <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'EnvironmentResources.Instances' \
  --output json

# EB 환경의 ASG 이름 추출 (Analyze 모드에서 활용)
aws elasticbeanstalk describe-environment-resources \
  --environment-name <environment> \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'EnvironmentResources.AutoScalingGroups[0].Name' \
  --output text
```

**판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| Health가 `health_critical` 목록에 포함 | ⛔ CRITICAL | "환경 불안정 (Health: X)" |
| Health가 `health_warning` 목록에 포함 | ⚠️ HIGH | "환경 경고 상태 (Health: X)" |
| 현재 인스턴스 = MinSize | ⚠️ HIGH | "Auto Scaling 여유 없음 (현재 X/X)" |

#### EB 배포 중 Migration 상태 모니터링

배포가 진행 중이거나 최근 완료된 경우, migration 실행 상태를 확인합니다.

```bash
# 최근 EB 이벤트 (배포/migration 관련)
aws elasticbeanstalk describe-events \
  --environment-name <environment> \
  --start-time $(date -u -v-1d +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "1 day ago" +%Y-%m-%dT%H:%M:%S) \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --query 'Events[*].{Time:EventDate,Severity:Severity,Message:Message}' \
  --output json

# 현재 배포 상태 확인
aws elasticbeanstalk describe-environment-health \
  --environment-name <environment> \
  --attribute-names Status Causes \
  --region $AWS_REGION --profile $AWS_PROFILE \
  --output json
```

**배포 중 migration 판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 이벤트에 "migrate" 또는 "migration" 포함 + Severity=ERROR | ⛔ CRITICAL | "Migration 실패 감지: {이벤트 메시지}" |
| 이벤트에 "migrate" 포함 + Severity=WARN | ⚠️ HIGH | "Migration 경고: {이벤트 메시지}" |
| 환경 Status=Updating + 최근 이벤트에 "deploy" 포함 | ℹ️ INFO | "배포 진행 중 (migration 포함 가능)" |
| 최근 이벤트에 "successfully" + "command" 포함 | ✅ OK | "최근 배포 정상 완료" |

#### Git Migration 파일 충돌 감지

Django 프로젝트인 경우 (manage.py 존재), migration 파일 번호 중복을 감지합니다.
이 체크는 `pwd`가 Django 프로젝트일 때만 실행됩니다.

**중요: 번호 중복 ≠ 충돌. merge migration이 존재하면 Django가 정상 처리하므로 false positive를 반드시 필터링해야 합니다.**

**두 가지 모드:**
- **로컬 모드** (기본): 현재 워킹 트리의 migration 번호 중복 감지
- **PR 모드** (`--pr N`): GitHub PR 번호로 원격 브랜치의 migration 파일을 production과 비교

##### PR 모드 (`--pr N`)

PR 번호가 주어지면, 해당 PR의 head 브랜치에서 새로 추가된 migration 파일을 production 브랜치와 비교합니다.

```bash
# Step 1: PR 정보 조회 (head branch 이름)
PR_HEAD=$(gh pr view <N> --json headRefName -q '.headRefName')
PR_BASE=$(gh pr view <N> --json baseRefName -q '.baseRefName')

# Step 2: 원격 브랜치 fetch
git fetch origin "$PR_HEAD" "$PR_BASE"

# Step 3: PR에서 새로 추가된 migration 파일 추출
NEW_MIGRATIONS=$(git diff --name-only "origin/$PR_BASE...origin/$PR_HEAD" -- "*/migrations/[0-9]*.py")

# Step 4: 각 새 migration의 번호가 base 브랜치에서 충돌하는지 확인
for mig in $NEW_MIGRATIONS; do
  app=$(echo "$mig" | sed 's|/migrations/.*||' | sed 's|.*/||')
  num=$(basename "$mig" | sed 's|_.*||')
  # base 브랜치에 같은 번호의 migration이 있는지 확인
  existing=$(git ls-tree "origin/$PR_BASE" "$(dirname $mig)/" | awk '{print $4}' | sed 's|.*/||' | sed 's|_.*||' | sort -u)
  if echo "$existing" | /usr/bin/grep -q "^${num}$"; then
    echo "CONFLICT: $app/$num — base 브랜치에 이미 존재"
  fi
done

# Step 5: base 브랜치의 해당 앱 최신 migration 번호 확인
for mig in $NEW_MIGRATIONS; do
  app_path=$(dirname "$mig")
  app=$(echo "$app_path" | sed 's|.*/||')
  latest_on_base=$(git ls-tree "origin/$PR_BASE" "$app_path/" | awk '{print $4}' | sed 's|.*/||; s|_.*||' | sort -n | tail -1)
  new_num=$(basename "$mig" | sed 's|_.*||')
  echo "$app: base 최신=$latest_on_base, PR 추가=$new_num"
done
```

**PR 모드 판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| PR의 새 migration 번호가 base에 이미 존재 | ⛔ CRITICAL | "Migration 번호 충돌: {app}/{number} — base 브랜치에 이미 존재. merge migration 필요" |
| PR의 새 migration 번호가 base 최신 번호의 다음 | ✅ OK | "{app}: {base_latest} → {new_num} (순차적)" |
| PR의 새 migration 번호에 gap 존재 | ⚠️ HIGH | "{app}: {base_latest} → {new_num} (비순차적, 중간 번호 누락 확인 필요)" |

##### 로컬 모드 (기본)

Python 스크립트로 정확한 충돌 감지 (shell grep의 인용부호 이슈 방지):

```python
python3 -c "
import os, re
from pathlib import Path

migrations_dir = Path('.')  # Django 프로젝트 루트 (manage.py 위치)
apps = {}

# 앱별 migration 파일 수집
for mig in migrations_dir.rglob('migrations/[0-9]*.py'):
    if 'venv' in str(mig) or '__pycache__' in str(mig):
        continue
    app = mig.parent.parent.name
    num = mig.name.split('_')[0]
    apps.setdefault(app, {}).setdefault(num, []).append(mig.name)

# 중복 번호 찾기
duplicates = {}
for app, nums in apps.items():
    for num, files in nums.items():
        if len(files) > 1:
            duplicates.setdefault(app, {})[num] = files

# merge migration으로 해결 여부 확인
real_conflicts = []
for app, nums in duplicates.items():
    for num, files in nums.items():
        resolved = False
        app_migs_dir = next(migrations_dir.rglob(f'{app}/migrations'), None)
        if not app_migs_dir:
            continue
        for mf in app_migs_dir.glob('[0-9]*.py'):
            mnum = mf.name.split('_')[0]
            try:
                if int(mnum) > int(num):
                    content = mf.read_text()
                    if f'{num}_' in content:
                        resolved = True
                        break
            except ValueError:
                continue
        if not resolved:
            real_conflicts.append(f'{app}/{num}')

print(f'Total duplicates: {sum(len(v) for v in duplicates.values())}')
print(f'Real conflicts: {len(real_conflicts)}')
if real_conflicts:
    for c in real_conflicts:
        print(f'  CONFLICT: {c}')
else:
    print('  All resolved by merge migrations')
"
```

**로컬 모드 판정:**

| 조건 | 심각도 | 메시지 |
|------|--------|--------|
| 같은 번호 + merge migration 없음 | ⛔ CRITICAL | "Migration 충돌: {app}/{number} — merge migration 필요. 배포 전 해결 필수" |
| 같은 번호 + merge migration 존재 | ✅ OK | (리포트에서 제외 — 정상적인 브랜치 병합 결과) |

### Step 3: Monitor 리포트 출력

```
═══════════════════════════════════════════════════
  AWS Resource Report — <project>
  <date> KST (최근 <minutes>분)
═══════════════════════════════════════════════════

📦 <name> (<type>: <id>)
  <인스턴스 정보>
  <메트릭 요약>                               <판정>
  → <문제 있으면 권장 조치>

📦 <name> (<type>: <id>)
  ...

═══════════════════════════════════════════════════
  요약: ⛔ CRITICAL N | ⚠️ HIGH N | ✅ OK N
═══════════════════════════════════════════════════

🔄 Migration 상태 (Django 프로젝트인 경우)
  배포 상태: <진행 중 / 최근 완료 / 없음>
  번호 중복: N건 (merge migration으로 해결됨 → ✅ OK)
  미해결 충돌: <없음 / {app}/{number} — merge migration 필요>
  → <미해결 충돌이 있을 때만 조치 안내>

  (--pr N 사용 시 추가)
  PR #N: <title>
  브랜치: <head> → <base>
  새 migration: N개
  ┌──────────┬──────────────┬──────────────┬──────────┐
  │ App      │ Base 최신    │ PR 추가      │ 판정     │
  ├──────────┼──────────────┼──────────────┼──────────┤
  │ <app>    │ <base_num>   │ <new_num>    │ ✅ / ⛔  │
  └──────────┴──────────────┴──────────────┴──────────┘
═══════════════════════════════════════════════════
```

각 리소스 블록은 다음 형식:
- 1행: 인스턴스 정보 (타입, 버전, 크기 등)
- 2~3행: 주요 메트릭 (평균 | 피크) + 판정 아이콘
- 이슈 있으면: `→` 로 시작하는 권장 조치 행

replica 리소스는 primary보다 간략하게 표시 (CPU, 커넥션만).

---

## Analyze 모드

### Step 10: 변경 내용 파싱

`--analyze` 인자의 자연어를 해석하여:
1. **대상 리소스 타입** 추출 (ec2-asg, rds, elasticache, elasticbeanstalk)
2. **변경 항목** 추출 (인스턴스 수, 인스턴스 타입, 스케일링 정책 등)
3. YAML 리소스 목록과 매칭

매칭이 모호하면 YAML 리소스 목록을 보여주며 사용자에게 확인:
```
대상 리소스를 확인해주세요:
1. 웹 서버 환경 (elasticbeanstalk: Prod-env-1)
2. 메인 DB Primary (rds: plab3)
3. Redis Primary (elasticache: pf-production-redis-001)
```

EB 환경의 경우: ASG 이름을 `describe-environment-resources`로 추출하여 EC2 메트릭 조회에 활용.

### Step 11: 메트릭 수집

대상 리소스의 메트릭을 수집합니다 (기본 7일, `--days`로 조정).

Monitor 모드와 동일한 AWS CLI 명령어를 사용하되:
- **일별 피크**를 추출하기 위해 `--period 86400` (1일 단위)로도 추가 조회
- 스케일링 이벤트 이력도 수집

### Step 12: 변경 시뮬레이션

변경 유형별 계산 로직:

**인스턴스 수 변경 (ec2-asg, elasticbeanstalk, elasticache):**
```
예상 CPU = 현재 CPU × (현재 수 / 변경 후 수)
```
일별 피크 기준으로 테이블을 생성하고, 임계값 대비 여유(headroom)를 계산합니다.

**인스턴스 타입 변경 (rds, elasticache):**
- vCPU/메모리 비율로 예상 부하 환산
- 예: r5.large(2vCPU) → r5.xlarge(4vCPU) → CPU 부하 약 50% 감소 예상

**스케일링 정책 변경 (ec2-asg, elasticbeanstalk):**
- Max → Avg 변경: 정책 변경의 의미와 영향 설명
- 임계값 변경: 새 임계값 기준으로 여유율 재계산

### Step 13: Analyze 판정

thresholds.yaml의 `analyze` 섹션 참조:

| 결과 | 조건 |
|------|------|
| ✅ LOW RISK — 변경 가능 | 모든 예상 수치가 임계값 대비 `headroom_safe_pct` 이상 여유 |
| ⚠️ MEDIUM RISK — 주의 필요 | 일부 예상 수치가 임계값 대비 `headroom_safe_pct` 미만 여유 |
| ⛔ HIGH RISK — 변경 위험 | 예상 수치가 임계값 초과 |

### Step 14: Analyze 리포트 출력

```
═══════════════════════════════════════════════════
  AWS Change Impact Analysis — <project>
  <date> KST
═══════════════════════════════════════════════════

📋 변경 요약
  대상: <name> (<type>: <id>)
  변경1: <before> → <after>
  변경2: <before> → <after>
  분석 기간: 최근 <days>일 (<start> ~ <end>)

📊 현재 상태 (<현재 설정>)
  CPU 전체 평균: X%
  CPU 피크 평균: X% (<요일>)
  <기타 주요 메트릭>

📈 변경 후 예상 (<변경 후 설정>)
  ┌────────────┬──────────┬──────────┬────────────┐
  │ 날짜       │ 현재 피크│ 예상 피크│ 임계값 대비│
  ├────────────┼──────────┼──────────┼────────────┤
  │ MM/DD (요) │   XX.X%  │   XX.X%  │  XX.X%p    │
  │ ...        │   ...    │   ...    │  ...       │
  └────────────┴──────────┴──────────┴────────────┘

🔍 판정
  <판정 결과>
  • <근거 1>
  • <근거 2>

  ⚠️ 주의사항 (해당 시)
  • <주의 사항>
═══════════════════════════════════════════════════
```

---

## Error Handling

| 상황 | 대응 |
|------|------|
| AWS CLI 미설치 | "`aws` CLI가 필요합니다. `brew install awscli`" 안내 후 종료 |
| AWS 인증 실패 | "`aws configure --profile <profile>` 확인 필요" 안내 후 종료 |
| YAML 없음 | "리소스 설정이 없습니다" + `~/.claude/command-scripts/ops/aws-resource-analyzer/README.md` 참조 안내 + 템플릿 제시 |
| 특정 리소스 조회 실패 | 해당 리소스 `⚠️ 조회 실패` 표시, 나머지 계속 진행 |
| Analyze 모드 대상 리소스 모호 | YAML 리소스 목록 보여주며 사용자에게 확인 |
| CloudWatch 데이터 없음 | "데이터 없음 (신규 리소스?)" 표시 |

### YAML 미존재 시 템플릿 제시

```yaml
# ~/.claude/command-scripts/ops/aws-resource-analyzer/resources/<project>.yaml
project: <project-name>
path_match: "*/<project-name>*"
aws_profile: default
region: ap-northeast-2

resources:
  - type: ec2-asg        # ec2-asg | rds | elasticache | elasticbeanstalk
    name: "설명"
    asg_name: my-asg

  - type: rds
    name: "설명"
    instance_id: my-db
    role: primary         # primary | replica

  - type: elasticache
    name: "설명"
    cluster_id: my-redis
    role: primary

  - type: elasticbeanstalk
    name: "설명"
    application: my-app
    environment: my-env
```
