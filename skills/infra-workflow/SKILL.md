---
name: infra-workflow
description: Use when starting any AWS infrastructure task — provisioning, modifying, debugging, or auditing AWS resources via CLI. Orchestrates context detection, safe exploration, blast-radius assessment, dry-run, execution, verification, and recording. Triggers on infra requests, AWS resource changes, or explicit workflow invocation. Skip for simple read-only `describe-*` / `list-*` calls.
---

# Infrastructure Workflow Orchestrator (AWS)

## Overview

Single orchestrator for AWS CLI 기반 인프라 작업. dev-workflow의 인프라 대응판.
Read-only 조회는 자유, mutating 작업(`create-*`/`update-*`/`put-*`/`delete-*`/`terminate-*`)은 반드시 전 단계 통과.

코드베이스 작업이 아니므로 `dev-workflow` 대신 이 스킬 사용.

## When to Use

| 상황 | 이 스킬 사용? |
|---|---|
| `aws ec2 describe-instances`, `aws s3 ls` 등 단순 조회 | ❌ skip |
| 리소스 디버깅 (파이프라인 실패 등) | `ops:aws-debugger` 우선, 필요 시 이 스킬 |
| 리소스 생성/수정/삭제 | ✅ 필수 |
| 보안 그룹/IAM 정책 변경 | ✅ 필수 |
| RDS 파라미터/스냅샷/스케일링 | ✅ 필수 |
| Lambda/ECS task definition 배포 | ✅ 필수 |
| Cost/cleanup 정기 점검 | ✅ 권장 |

## Step Sequence (필수 추적)

순서 강제. 각 Step 완료 시 announce: "**Step N 완료. 다음: Step N+1 ([name])**".

```
Step 1: Context & Identity
Step 2: Scope Definition
Step 3: Read-only Discovery
Step 4: Blast Radius Assessment
Step 5: Dry-run / Change-set
Step 6: Confirmation Gate
Step 7: Execute
Step 8: Verification
Step 9: Record
```

---

## Workflow Steps

### Step 1: Context & Identity

작업 시작 전 현재 AWS context 확인. 잘못된 계정/리전에서 변경 가능성 차단.

```bash
# 디렉토리 기반 프로파일 결정 (apis.md 규칙)
if [[ "$PWD" == "$HOME/work/"* || "$PWD" == "$HOME/plab/"* ]]; then
  export AWS_PROFILE=plab
else
  export AWS_PROFILE=${AWS_PROFILE:-default}
fi
export AWS_REGION=${AWS_REGION:-ap-northeast-2}

aws sts get-caller-identity
echo "Region: $AWS_REGION  Profile: $AWS_PROFILE"
```

출력을 사용자에게 보여주고 확인. account ID/리전이 의도와 다르면 즉시 중단.

### Step 2: Scope Definition

AskUserQuestion으로 명시:

- **목적**: 무엇을 달성? (한 줄)
- **대상 리소스**: ARN/이름/태그
- **환경**: prod / staging / dev
- **되돌릴 수 있나?**: rollback 절차 또는 "불가" 명시

**복잡도 분기:**

| 작업 종류 | 행동 |
|---|---|
| 단일 리소스 단순 변경 | 이 step에서 끝 |
| 다중 리소스 / 마이그레이션 / 아키텍처 변경 | `superpowers:brainstorming` 호출하여 옵션 발산 |
| 알려진 패턴이지만 plan 문서 필요 | Step 4 후 `superpowers:writing-plans` |

prod 작업이면 **Step 6 confirmation gate에서 더블 확인** 적용.

### Step 3: Read-only Discovery

mutating 명령 전에 현재 상태 스냅샷. 항상 `describe-*` / `list-*` / `get-*`만 사용.

```bash
# 예: RDS 파라미터 변경 전
aws rds describe-db-instances --db-instance-identifier <id> > /tmp/before-state.json
aws rds describe-db-parameters --db-parameter-group-name <pg> > /tmp/before-params.json
```

상태를 `/tmp/`에 저장 → Step 8 verification에서 비교용.

코드베이스 탐색 필요 시 `code-review-graph` MCP 우선 (CLAUDE.md 규칙).

### Step 4: Blast Radius Assessment

mutating 작업 직전 평가. AskUserQuestion으로 답 받음:

| 질문 | 위험 |
|---|---|
| 어떤 서비스가 이 리소스에 의존? | 다운스트림 영향 |
| 다운타임 발생? | 사용자 영향 |
| 데이터 손실 가능성? | 복구 가능성 |
| IAM/SG 변경 시 권한 escalation? | 보안 |
| cost 영향? | 청구 |

prod + (다운타임 OR 데이터 손실 가능) → 사용자에게 명시적 "진행" 답변 요구. default proceed 금지.

**Plan 문서화 (선택):**

복잡도 높으면 (다중 리소스 / 단계별 마이그레이션 / rollback 절차 길어짐) `superpowers:writing-plans` 호출:
- plan 파일 위치: `docs/infra/MMDD-<topic>-plan.md` (repo 내) 또는 `~/prv/infra-log/MMDD-<topic>-plan.md`
- plan 안에 단계별 명령 + 각 단계 verify 조건 포함
- Step 9 record와 합쳐 사용

**Deep analysis (선택):**

- `sc:analyze` — 리소스 의존 그래프 / cost 영향 깊이 분석
- `sc:troubleshoot` — 사전 위험 시나리오 brainstorm

### Step 5: Dry-run / Change-set

명령에 dry-run 옵션 있으면 무조건 먼저:

```bash
# 지원 명령 예시
aws ec2 run-instances ... --dry-run
aws cloudformation create-change-set ...      # change-set 후 describe로 diff 확인
aws iam simulate-principal-policy ...          # IAM 변경 시 시뮬레이션
aws s3 sync --dryrun ...
```

dry-run 없는 명령은:
1. **명령을 사용자에게 그대로 보여주고** 정확한 인자 확인
2. 가능하면 staging 리소스로 먼저 테스트

### Step 6: Confirmation Gate

destructive / prod 변경은 AskUserQuestion 필수. 옵션:

- "예, 진행"
- "명령만 출력 (내가 직접 실행)"
- "취소"

명령 출력 시 **정확한 CLI 라인** 제공 (env var 확장 포함).

### Step 7: Execute

실행. 출력은 `/tmp/exec-result.json` 같은 파일로 저장 (긴 출력은 UI 접힘 — RTK.md 참조).

```bash
aws <command> ... 2>&1 | tee /tmp/exec-result.log
echo "Exit: $?"
```

실패 시 즉시 중단, 에러 메시지 그대로 사용자에게.

### Step 8: Verification

변경 후 동일한 `describe-*` 재실행. before/after diff:

```bash
aws rds describe-db-instances --db-instance-identifier <id> > /tmp/after-state.json
diff <(jq -S . /tmp/before-state.json) <(jq -S . /tmp/after-state.json)
```

추가 검증:
- 의존 서비스 헬스 (Datadog/CloudWatch alarm)
- 애플리케이션 레벨 smoke test (해당 시)
- `ops:datadog-latency-watch` 활용 가능

**완료 체크리스트 강제:**

`superpowers:verification-before-completion` 호출하여 누락 항목 검출. 특히:
- before/after diff 실제로 비교했나?
- rollback 절차 검증했나? (드라이런/staging)
- 모니터링 alarm 정상?
- Step 9 record 작성 완료?

체크리스트 통과 전까지 "완료" announce 금지.

### Step 9: Record

변경 사항 기록. 옵션:

| 위치 | 언제 |
|---|---|
| `docs/infra/MMDD-<topic>.md` | repo 내 인프라 변경 (Terraform/CFN 없을 때) |
| Jira/Notion 티켓 코멘트 | 티켓 있는 작업 |
| `~/prv/infra-log/MMDD.md` | 개인 ad-hoc 작업 |

기록 항목:
- 실행한 명령 (정확한 CLI)
- before/after 상태 요약
- rollback 절차
- 발견한 이슈/learning

---

## Skip Conditions

전체 워크플로 skip해도 되는 경우:
- 순수 조회 (`describe-*`, `list-*`, `get-*`)
- `ops:aws-debugger` 이미 실행 중 (그쪽이 더 구체적)
- 사용자가 명시적으로 "그냥 실행해" 지시 (Step 6는 유지)

## Related Skills

**Internal ops:**
- `ops:aws-debugger` — 에러/실패 근본 원인 추적 (이 스킬보다 우선)
- `ops:aws-resource-analyzer` — 리소스 분석/리포트
- `ops:production-safety-audit` — prod 변경 사전 감사
- `ops:datadog-latency-watch` — Step 8 검증 보조
- `infra-safety-gate` — destructive 명령 자동 게이트 (이 스킬 경량 버전)

**Superpowers (스텝 보강):**
- `superpowers:brainstorming` — Step 2 (복잡한 마이그레이션 옵션 발산)
- `superpowers:writing-plans` — Step 4 후 (단계별 plan 문서화)
- `superpowers:verification-before-completion` — Step 8 (완료 체크리스트 강제)
- `superpowers:systematic-debugging` — 실패 시 디버깅 루프

**SuperClaude (선택적 분석):**
- `sc:analyze` — 리소스 의존/cost 깊이 분석
- `sc:troubleshoot` — 사전 위험 시나리오 brainstorm
- `sc:estimate` — 작업 시간/비용 추정
