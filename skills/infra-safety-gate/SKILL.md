---
name: infra-safety-gate
description: Use IMMEDIATELY before executing any destructive or state-mutating AWS CLI command (delete/terminate/put/create/update/modify/detach/revoke/reboot/stop). Lightweight gate — no full workflow, just identity check + confirmation + rollback note. Skip for read-only describe/list/get calls.
---

# Infra Safety Gate (AWS CLI)

## Overview

가벼운 게이트. `infra-workflow` 전체 워크플로 없이도 destructive AWS CLI 명령 직전에 강제 통과시키는 최소 안전장치.

조회 명령은 자유. mutating 명령에만 발동.

## Trigger Verbs

다음 verb 포함 명령 실행 직전 반드시 이 스킬 통과:

| 분류 | 예시 verb |
|---|---|
| 삭제 | `delete-*`, `terminate-*`, `deregister-*`, `remove-*`, `destroy-*` |
| 변경 | `put-*`, `modify-*`, `update-*`, `replace-*`, `set-*` |
| 생성 (cost 발생) | `create-*`, `run-instances`, `start-*` (단, `start-query` 같은 무해한 건 제외) |
| 네트워크/보안 | `authorize-*`, `revoke-*`, `attach-*`, `detach-*`, `associate-*`, `disassociate-*` |
| 상태 변경 | `reboot-*`, `stop-*`, `failover-*`, `restore-*` |
| 데이터 | `s3 rm`, `s3 sync` (without `--dryrun`), `s3 mv` |

조회 verb (게이트 불필요): `describe-*`, `list-*`, `get-*`, `head-*`, `search-*`, `wait`

## Gate Checklist

명령 실행 직전 4단계만:

### 1. Identity Snapshot

```bash
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output table
echo "Region: ${AWS_REGION:-ap-northeast-2}  Profile: ${AWS_PROFILE:-default}"
```

사용자에게 보여주고 "맞나?" 1회 확인.

### 2. Command Echo

실행할 명령을 코드블럭으로 그대로 보여줌. env var 확장 결과까지:

```bash
# 예
aws ec2 terminate-instances --instance-ids i-0abc123def456
```

### 3. Rollback Note

한 줄로 답:
- **복구 가능?**: 가능/부분/불가
- **복구 방법**: 스냅샷 ID / 백업 위치 / "불가 — 재생성 필요"

복구 불가이고 prod면 AskUserQuestion으로 더블 확인. 옵션:
- "예, 진행"
- "취소 — 백업부터"

### 4. Execute or Defer

AskUserQuestion:

| 옵션 | 동작 |
|---|---|
| "실행" | 그대로 실행. 출력 `/tmp/`에 저장 |
| "명령만 출력 (내가 실행)" | 사용자에게 CLI 라인만 넘기고 skill 종료 |
| "취소" | 중단 |

## Auto-Escalate to infra-workflow

다음이면 `infra-safety-gate`만으로 부족 → `infra-workflow` 전체 권장:

- prod 환경 + 데이터 손실 가능
- IAM 정책/role 변경 (권한 범위 영향)
- RDS/Aurora 구조 변경 (인스턴스 클래스, parameter group, 백업 보존 등)
- CloudFormation/CDK 변경
- 다중 리소스 동시 변경 (3개 이상)

이 경우 다음 메시지:
> "이건 단순 게이트로 부족해 보임. `infra-workflow` 스킬 호출 추천."

## Skip Conditions

- read-only 명령 (`describe-*`, `list-*`, `get-*`)
- `--dryrun` / `--dry-run` 포함된 명령 (이미 안전)
- 사용자가 같은 세션에서 동일 리소스 그룹에 이미 게이트 통과한 후속 명령 (재확인 면제)

## Output Format

```
🛡️ Infra Safety Gate

Identity: <account> @ <region>  (profile: <profile>)
Command:  aws <verb> ...
Rollback: <one-liner>

▶ 실행 / 명령만 출력 / 취소 ?
```

## Related Skills

- `infra-workflow` — 전체 워크플로 (이 스킬 상위)
- `ops:production-safety-audit` — prod 변경 사전 감사
- `ops:aws-debugger` — 실패 후 디버깅
