---
name: deploy-triage
description: Use when a deploy watchdog job fires an alert (or you want to check one's status) - takes the ticket, pulls the raw evidence, verifies the issue is actually new and actually caused by that deploy, and produces a verdict with the case log written back
---

# deploy-triage

## Description

`/ops:deploy-watch` 가 만든 감시 잡이 알림을 쐈을 때 그걸 진단한다.
알림은 "무언가 떴다"까지만 말한다 — **그게 이 배포 탓인지, 애초에 새로운 건지,
심지어 프로덕션인지**는 아직 아무것도 확정되지 않았다.

산출물은 코드가 아니라 **판정**이다. 그리고 그 판정을 `cases.md` 에 되쓴다 —
그게 `/ops:deploy-watch` 가 다음번에 더 잘 고르는 유일한 경로다.

## How to Invoke

- `/ops:deploy-triage DEV-7711`
- `/ops:deploy-triage DEV-7711 --status` (알림 없이 현재 상태만)
- "7711 감시 알림 왔는데 이거 뭐야"

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| 티켓 ID | Yes | - | 감시 잡의 `TICKET` |
| `--status` | No | off | 판정 없이 현재 상태·이벤트만 요약 |

## 참조 파일

```
~/.claude/command-scripts/ops/deploy-watch/signals.md   환경 사실·베이스라인
~/.claude/command-scripts/ops/deploy-watch/cases.md     과거 판정 (같은 실수 반복 방지)
~/plab/jobs/state/{ticket-lower}-watch-phase.json       이벤트 원본
~/plab/jobs/tasks/{ticket-lower}-watch.sh               무엇을 감시하기로 했었나
```

---

## Instructions

### Step 0: 상태와 이벤트 확보

```bash
cd ~/plab/jobs
./tasks/{ticket-lower}-watch.sh status
```

여기서 뽑을 것:

| 필드 | 쓰임 |
|---|---|
| `phase` | WAITING 이면 아직 배포 전 — 알림은 다른 데서 온 것 |
| `deploy_detected_at` | **T0.** 모든 시각 판단의 기준 |
| `deploy_version` / `previous_version` | 롤백 후보 |
| `planned_failure_mode` | 착수 전에 뭘 예상했나 ← 대조 대상 |
| `planned_signals` | 무엇을 보기로 했나 (= 무엇을 **안** 보기로 했나) |
| `events[]` | 원본 증거 |

`--status` 면 여기까지만 요약하고 끝낸다.

### Step 1: 환경 확인 ⚠️ 가장 먼저

**이벤트가 프로덕션에서 온 게 맞나.** Sentry 이슈 목록만 보면 알 수 없다 —
이벤트 태그를 봐야 한다.

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/{issue_id}/events/latest/" \
  | jq '{tags:[.tags[]|select(.key=="environment" or .key=="server_name" or .key=="release" or .key=="transaction")|{(.key):.value}]}'
```

`environment` 가 `dev`/`qa`/`app_dev` 면 **프로덕션 사고가 아니다.** 그 사실을
먼저 못 박고 나머지 조사의 무게를 조정한다.

(실례: 2026-08-12 `stadium.tasks.auto_reset_stadium_is_new` 의 `AccessDenied` 는
`environment: dev`, 버킷도 `-dev` 였다. 프로덕션 경보로 읽으면 오독이다.)

### Step 2: 신규성 확인 — 이게 없으면 인과를 말할 수 없다

배포 직후에 보인다고 배포가 원인은 아니다. **원래 있던 것인지 먼저 배제한다.**

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  -G "https://sentry.io/api/0/projects/$PLAB_GH_ORG/{project}/issues/" \
  --data-urlencode "query={예외유형 또는 키워드}" --data-urlencode "statsPeriod=14d" \
  | jq -r 'if type=="array" then (.[]|"\(.firstSeen[0:16]) n=\(.count) \(.status) \(.culprit[0:45])") else .detail end'
```

⚠️ `statsPeriod` 는 `''`/`24h`/`14d` 만 받는다.

로그 신호였다면 같은 패턴으로 배포 **이전** 구간을 Logs Insights 로 훑어
베이스라인과 비교한다. `signals.md` 에 배포 전 실측값이 적혀 있다.

판정: `14일간 동일 유형 없음` → 신규 / `이전에도 있었음` → 배포 무관 가능성 큼.

### Step 3: 시각 대조

이벤트 `firstSeen` 을 T0 와 비교한다. T0 **이전**이면 배포가 원인일 수 없다.

주의: 배포는 순간이 아니다. 컨테이너가 순차 교체되므로 T0 전후 수 분은 회색지대다.
EB `DateUpdated` 는 배포 **완료** 시각이라 첫 컨테이너는 그보다 먼저 뜬다.

### Step 4: 메커니즘 검증 ⚠️ 여기서 오경보가 난다

**시각과 유형이 맞아떨어져도 아직 인과가 아니다.** diff 가 그 현상을 설명하는지
코드로 확인한다.

```bash
gh api repos/$PLAB_GH_ORG/$PLAB_REPO_SERVER/pulls/{N}/files --paginate \
  --jq '.[] | select(.filename|test("{관련 파일}")) | "===== \(.filename) =====\n\(.patch)"'
```

물을 것: **변경 전과 후에 실제로 달라지는 값이 무엇인가.**

> 2026-08-12 실패 사례 — prod EB EC2 role 이 `s3:PutObject`/`PutObjectRetention`
> 둘 다 `implicitDeny` 인 걸 `simulate-principal-policy` 로 보고 "프로덕션 깨진다"고
> 보고했다. **틀렸다.** `settings/prod.py` 가 boto3 보다 먼저
> `os.environ["AWS_ACCESS_KEY_ID"] = os.environ["PROD_AWS_ACCESS_KEY_ID"]` 를 하므로
> botocore EnvProvider 가 먼저 걸리고 인스턴스 프로파일까지 내려가지 않는다.
>
> 같은 조사에서 dev 도 변경 전후 모두 `DEV_AWS_*` 로 해석돼 **identity 가 안 바뀐다**는
> 게 드러났다 → 그 `AccessDenied` 는 이 PR 탓이 아니다.
>
> **규칙: 권한/설정 조회 결과만으로 판정하지 말 것. 해석 경로를 코드에서 따라갈 것.**

자격증명 계열이면 IAM 주체를 특정하고 권한을 확인하되, **그 주체가 실제로 쓰이는지**를
코드로 확인한 뒤에만 결론을 낸다.

```bash
# 주체는 Sentry 이벤트 메시지의 `User: arn:...` 에 대개 그대로 찍힌다
AWS_PROFILE=plab aws iam simulate-principal-policy \
  --policy-source-arn {arn} --action-names {action} --resource-arns {resource} \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output json
```

### Step 5: 영향 범위

- 사용자 영향: Sentry `userCount`, 발생 건수
- 경로: 웹 요청인가 배치/푸시/메시징인가 (`culprit`, `transaction` 태그)
- 확산 중인가: 시간당 발생 추이

`userCount 0` + 배치 경로면 긴급도가 확 내려간다. 그래도 **조용히 틀리는 것**이
더 위험한 부류(정산·집계)면 반대다.

### Step 6: 판정

셋 중 하나로 떨어뜨린다. 애매하면 애매하다고 쓰고 무엇이 더 필요한지 적는다.

| 판정 | 조건 | 다음 행동 |
|---|---|---|
| 🔴 **배포 회귀** | 신규 + T0 이후 + 메커니즘이 설명됨 + 프로덕션 | 롤백 vs 전진 수정 판단 |
| 🟡 **무관 (별건)** | 실재하지만 신규 아님 / 메커니즘 불일치 / 비프로덕션 | 별도 티켓. 감시는 계속 |
| ⚪ **오탐** | 신호 설계 문제 (패턴 과다, 베이스라인 오측) | **감시 잡 신호를 고친다** |

⚪ 는 그냥 넘기지 말 것 — `LOG_PATTERN`/`CRITICAL_TYPES` 를 좁히고 `cases.md` 에
왜 헛짚었는지 남긴다. 그게 다음 잡의 정확도다.

**⚪ 면 굳은 이벤트를 반드시 치운다.** 이벤트는 누적되고 스스로 지워지지 않는다.
남겨두면 남은 감시 기간 내내 트립 상태라 **진짜 이벤트가 이미 울고 있는 알림에
묻힌다** — 감시 잡을 만든 이유가 무효화된다.

```bash
cd ~/plab/jobs
# {패턴} = 지울 이벤트의 sig 접두어 (예: sentry-error, logs-query)
jq 'del(.events[] | select(.sig|startswith("{패턴}")))
    | .seen = (.seen - [.seen[]|select(startswith("{패턴}"))])
    | .fail_streak = {}' \
  state/{ticket-lower}-watch-phase.json > /tmp/s \
  && mv /tmp/s state/{ticket-lower}-watch-phase.json

./tasks/{ticket-lower}-watch.sh     # `OK` 로 돌아오는지 확인
```

`seen` 에서도 지워야 한다 — 거기 남으면 같은 신호가 다시 떠도 이벤트가 안 생긴다
(그때는 반대로 **진짜를 놓친다**).

🔴 면 롤백 후보를 확인해 둔다 (실행은 사람이 결정):

```bash
# 직전 버전 = 상태 파일의 previous_version
AWS_PROFILE=plab aws elasticbeanstalk describe-application-versions \
  --application-name prod --region ap-northeast-2 \
  --query 'ApplicationVersions[:5].[VersionLabel,DateCreated]' --output json
```

### Step 7: 되쓰기 — 이걸 빼면 스킬이 학습하지 않는다

`cases.md` 의 해당 행 `판정` 칸을 채운다. 쓸 것:

- 예상한 실패 모드가 맞았나
- 고른 신호가 실제로 잡았나 / 헛돌았나
- **놓친 신호가 있었나** ← 다음 `/ops:deploy-watch` 가 제일 필요로 하는 정보

행이 아직 없으면(감시가 DONE 전이면) 추가하고 `결과` 는 비워 둔다 — 스크립트가 채운다.

판정이 🔴 이고 되돌리기 비용이 컸다면 `~/.claude/judgment-log.md` 규칙에 따라
`★ADR후보` 로 표시한다.

---

## 리포트 형식

```
🔎 {티켓} 배포 감시 진단

  배포        {deploy_version}  T0 {시각} KST
  예상        {planned_failure_mode}
  감시 신호    {planned_signals}

  이벤트 {n}건
  ─────────────────────────────────────────
  [1] {시각}  {요약}
      환경      {environment}          ← 프로덕션인가
      신규성    {14일 이력 결과}        ← 원래 있었나
      시각      T0 {이전|이후} {차이}
      메커니즘  {diff가 설명하나 + 코드 근거}
      영향      users {n} / {경로}

  판정  🔴|🟡|⚪  {한 줄}
  근거  {무엇이 판정을 갈랐나}

  다음
    {행동}
    감시: {계속|신호 수정|종료}

  cases.md 갱신 ✅
```

**네 칸(환경/신규성/시각/메커니즘)을 빼지 말 것.** 오늘 오경보가 난 이유가
메커니즘 칸을 건너뛰고 권한 조회 결과로 바로 판정했기 때문이다.

## Error Handling

| 상황 | 대응 |
|---|---|
| `phase: WAITING` | 아직 배포 전. 알림은 다른 출처 — 그 사실을 먼저 보고 |
| `phase: DONE` 인데 이벤트 0 | 무음 완주. `판정` 칸에 "무음, 예상 신호 미발현" 기록. **"이상 없음"과 "안 보고 있었음"을 구분해 쓸 것** |
| 상태 파일 없음 | 감시 잡이 없거나 티켓명 불일치. `ls ~/plab/jobs/state/*-watch-phase.json` |
| Sentry 이슈 삭제/병합됨 | 이벤트 `text` 에 남은 원문으로 진행, 조회 불가를 명시 |
| 이벤트가 `*-error` / `⚠️ 감시 잡 조회 실패 N회 연속` | 사고가 아니라 **감시 잡 자체의 고장**. 승격 임계가 3회이므로 이게 떴다면 **약 30분 이상 눈이 먼 것**이다 — 그 구간의 진짜 이벤트는 못 봤다고 가정할 것. 자격증명·네트워크·API 상태를 확인하고, 복구 후 그 구간을 수동으로 훑는다 |

## Notes

- 감시 잡이 `running` 인 동안에도 진단 가능하다 — 상태 파일은 읽기만 한다.
- 판정을 **대신 정해 주지 말 것.** 증거를 정리해 내놓고, 애매하면 애매하다고 쓴다.
  `cases.md` 의 가치는 정확한 판정이지 빠른 판정이 아니다.
- 가장 값진 행은 **예상이 빗나간 행**이다. 틀린 예상을 지우지 말 것.
