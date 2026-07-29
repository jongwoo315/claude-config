# ops:aws-resource-analyzer 설정

## 디렉토리 구조

```
aws-resource-analyzer/
├── resources/              # 프로젝트별 리소스 정의
│   └── work-main.yaml
├── thresholds.yaml         # 전역 판정 기준
└── README.md               # 이 파일
```

## 새 프로젝트 추가

`resources/` 에 YAML 파일 생성:

```yaml
project: <project-name>
path_match: "*/<project-name>*"
aws_profile: default
region: ap-northeast-2

resources:
  - type: ec2-asg
    name: "설명"
    asg_name: my-asg

  - type: rds
    name: "설명"
    instance_id: my-db
    role: primary    # primary | replica

  - type: elasticache
    name: "설명"
    cluster_id: my-redis
    role: primary

  - type: elasticbeanstalk
    name: "설명"
    application: my-app
    environment: my-env
```

## 새 리소스 타입 추가

1. YAML에 `type: <new-type>` 항목 추가
2. 스킬 파일(`~/.claude/commands/ops/aws-resource-analyzer.md`)에 핸들러 섹션 추가
3. `thresholds.yaml`에 해당 타입의 임계값 정의

## 판정 기준 커스터마이징

`thresholds.yaml` 에서 각 리소스 타입별 임계값 수정.
