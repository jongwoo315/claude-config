# Production Safety Audit — Infra Configuration

## 구조

```
infra/
├── README.md                     # 이 파일
├── work-main.yaml         # ~/work/$PLAB_REPO_SERVER 프로젝트
└── <project-name>.yaml           # 다른 프로젝트 추가 시
```

## 프로젝트 매칭

커맨드 실행 시 `pwd`를 yaml의 `path_match` 패턴과 비교하여 매칭.

- `~/work/$PLAB_REPO_SERVER/` → `work-main.yaml`
- `~/prv/my-project/` → `my-project.yaml`

## 새 프로젝트 추가

1. 기존 yaml 파일을 복사:
   ```bash
   cp work-main.yaml <new-project>.yaml
   ```

2. `project`, `path_match`, `aws_profile`, `region` 수정

3. 리소스 목록 업데이트:
   ```bash
   # ElastiCache 클러스터 확인
   aws elasticache describe-cache-clusters --region <region> \
     --query 'CacheClusters[*].[CacheClusterId,CacheNodeType,Engine]' \
     --output table

   # RDS 인스턴스 확인
   aws rds describe-db-instances --region <region> \
     --query 'DBInstances[*].[DBInstanceIdentifier,DBInstanceClass,Engine]' \
     --output table

   # EB 환경 확인
   aws elasticbeanstalk describe-environments --region <region> \
     --query 'Environments[*].[EnvironmentName,ApplicationName,Status,Health]' \
     --output table
   ```

## 기존 프로젝트 리소스 수정

yaml 파일에서 해당 리소스 항목을 추가/수정/삭제.

### 리소스 타입별 필수 필드

**redis:**
```yaml
- cluster_id: <ElastiCache cluster ID>
  description: "설명"
  role: primary | replica
  metrics:                          # primary만 필요
    - EngineCPUUtilization
    - CPUCreditBalance              # t계열일 때만
    - CurrConnections
    - DatabaseMemoryUsagePercentage
```

**rds:**
```yaml
- instance_id: <RDS instance ID>
  description: "설명"
  role: primary | replica
  metrics:
    - CPUUtilization
    - DatabaseConnections
    - FreeableMemory
    - CPUCreditBalance              # t계열일 때만
```

**elasticbeanstalk:**
```yaml
- environment: <EB environment name>
  application: <EB application name>
  description: "설명"
  check:
    - instance_type
    - min_instances
    - health
```

## work/ vs prv/ 분리

| 디렉토리 | AWS Profile | 용도 |
|----------|-------------|------|
| `~/work/*` | `default` | $PLAB_GH_ORG 인프라 |
| `~/prv/*` | 프로젝트별 설정 | 개인 AWS 계정 |

yaml의 `aws_profile` 필드로 구분.
