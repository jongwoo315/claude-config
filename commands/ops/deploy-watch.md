---
name: deploy-watch
description: Use when you want to watch production for issues after a specific PR/ticket deploys - analyzes the PR diff to pick the right signals, then generates a deterministic watchdog job that polls every 10 minutes for N days and posts to Slack only on state changes
---

# deploy-watch

## Description

특정 PR/티켓의 프로덕션 배포를 감시하는 잡을 만든다. PR diff를 읽고 **이 변경의
실패 모드가 무엇인지** 판단해 신호를 고른 뒤, 결정적(deterministic) 감시
스크립트와 `jobs.yaml` 항목을 생성한다.

**모델이 하는 일은 신호 선정뿐이다.** 스크립트 골격은 동결된 템플릿을 복사한다 —
직접 써내지 말 것. 이유는 아래 Step 4.

`ops:deploy-perf-report` 와의 차이: 그건 배포 후 **1회** 레이턴시 리포트다.
이건 N일간 **무인 감시**다. 대부분의 PR은 레이턴시가 아니라 예외로 실패하므로
기본값으로 성능 리포트를 고르지 말 것 (Step 2의 계기 자격 검사).

## How to Invoke

- `/ops:deploy-watch 7630`
- `/ops:deploy-watch DEV-7711`
- `/ops:deploy-watch 7630 --days 5`
- "7630 배포되면 3일간 이슈 감시해줘"

## Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| PR 번호 또는 티켓 ID | Yes | - | 둘 중 하나. 티켓이면 PR을 역추적한다 |
| `--days` | No | 3 | 감시 기간 |
| `--repo` | No | `pf-server-django` | 대상 레포 |
| `--channel` | No | `default` (#워즈테스트) | `jobs.yaml`의 `slack_targets` 이름 |

## 참조 파일

작업 전에 **둘 다 읽는다.**

```
~/.claude/command-scripts/ops/deploy-watch/signals.md   신호 메뉴 + 환경 사실 + 베이스라인
~/.claude/command-scripts/ops/deploy-watch/cases.md     과거 판단과 그 결과
~/.claude/command-scripts/ops/deploy-watch/watch-template.sh   동결 골격
```

`cases.md`의 `판정` 칸에 과거 오판이 적혀 있다. 같은 실수를 반복하지 않는 게
이 파일의 목적이다.

---

## Instructions

### Step 0: PR 특정

```bash
gh api repos/$PLAB_GH_ORG/$PLAB_REPO_SERVER/pulls/{N} \
  --jq '{number,title,merged,merged_at,base:.base.ref,changed_files,additions,deletions}'
```

**릴리스 PR 이면 멈추고 되묻는다.** `base`가 `main`이고 제목이 `[Release]` 면
그건 여러 feature PR 묶음이라 감시 대상이 아니다. 안에서 실제 feature PR을 찾는다:

```bash
gh api repos/$PLAB_GH_ORG/$PLAB_REPO_SERVER/pulls/{N}/commits --paginate \
  --jq '.[] | "\(.commit.author.name) | \(.commit.message | split("\n")[0])"' \
  | grep -i "merge pull request"
```

티켓 ID로 들어왔으면 커밋 메시지의 `[DEV-XXXX]` 접두어로 역추적한다.

### Step 1: 실패 모드 판정

diff를 읽는다. **파일 목록이 아니라 패치 본문을 읽을 것** — 무엇이 바뀌었는지는
`.patch` 에만 있다.

```bash
gh api repos/$PLAB_GH_ORG/$PLAB_REPO_SERVER/pulls/{N}/files --paginate \
  --jq '.[] | "===== \(.filename) (+\(.additions)/-\(.deletions)) =====\n\(.patch)"'
```

`signals.md`의 "실패 모드 → 신호 매핑" 표로 분류한다. 복수 해당 가능.

이때 **"보면 안 되는 것" 열을 반드시 확인한다.** 자격증명 변경에 레이턴시를 보는
것이 초판의 실수였다.

### Step 2: 계기 자격 검사 ⚠️ 건너뛰지 말 것

레이턴시 기반 신호를 고르려 한다면, **먼저 영향 표면의 트래픽을 잰다.**

diff 에서 엔드포인트를 추적한 뒤 (`ops:deploy-perf-report`의 Step 2 매핑 규칙 재사용):

```bash
NOW=$(date +%s); FROM=$((NOW-86400))
curl -s -G "https://api.datadoghq.com/api/v1/query" \
  --data-urlencode "api_key=$DD_API_KEY" --data-urlencode "application_key=$DD_APP_KEY" \
  --data-urlencode "from=$FROM" --data-urlencode "to=$NOW" \
  --data-urlencode "query=sum:trace.django.request.hits{*} by {resource_name}.rollup(sum,86400)" \
  | jq -r '.series[]? | "\(.pointlist|map(.[1])|map(select(.!=null))|add // 0)\t\(.tag_set[0])"' | sort -rn
```

`일 요청 수 / 144 < 10` 이면 **레이턴시 신호 실격.** 예외 기반 신호로 갈 것.
이 판정을 리포트에 수치와 함께 남긴다.

### Step 3: 베이스라인 실측

고른 신호마다 **배포 전 정상값**을 잰다. 베이스라인 없이 임계를 정하면 그 임계는 감이다.

- 로그 패턴 → Logs Insights로 24h 스캔, 매치 건수
- Sentry → `firstSeen:-24h` 신규 이슈 수, 그리고 14일 일별 분포
- 커스텀 체크 → 며칠치 값 분포

베이스라인이 0이 아니면 그 사실을 `TRIAGE_HINT`에 적는다 — 그래야 알림 받은
사람이 "원래 있던 것"과 구분한다.

### Step 4: 스크립트 생성 — 템플릿을 복사한다

```bash
cp ~/.claude/command-scripts/ops/deploy-watch/watch-template.sh \
   ~/plab/jobs/tasks/{ticket-lower}-watch.sh
chmod +x ~/plab/jobs/tasks/{ticket-lower}-watch.sh
```

그다음 **"티켓별 설정" 블록만** 채운다. 그 블록 밖은 건드리지 않는다.

> **골격을 직접 써내지 말 것.** 여기 든 정확성이 전부 비싸게 산 것이다 —
> `hashlib`(내장 `hash()`는 `PYTHONHASHSEED` 때문에 중복 제거가 죽는다),
> 정상 출력 `OK` 고정(digest 안정성), 이벤트 누적(인시던트는 지속된다),
> T0 = 배포 시스템 기록 시각, bash 3.2 호환.
> 모델이 다시 써내면 이 수정들이 조용히 사라진다.

채울 값:

| 변수 | 결정 근거 |
|---|---|
| `TICKET` `WATCH_DAYS` | 입력 |
| `DEPLOY_DETECT` `EB_*`/`ECS_*` | `signals.md`의 레포별 표 |
| `LOG_GROUP` `LOG_PATTERN` | Step 1 실패 모드. 로그 신호 불필요하면 빈 문자열 |
| `SENTRY_PROJECTS` `CRITICAL_TYPES` | Step 1. 웹 요청 밖을 건드리면 **필수** |
| `EXTRA_CHECK_CMD` | 메뉴에 없는 신호가 필요할 때. **판정만 출력**, 변하는 숫자 금지 |
| `TRIAGE_HINT` | 이 티켓을 모르는 사람이 새벽에 읽는다고 가정하고 쓴다 |

`WATCH_FAIL_STREAK`(기본 3)은 조회 실패가 몇 번 연속돼야 이벤트가 되는지다.
주기를 10분이 아닌 값으로 바꿨다면 "30분쯤 눈이 먼 것"에 해당하도록 같이 조정한다.

### Step 5: jobs.yaml 등록

`~/plab/jobs/jobs.yaml`에 추가한다. 주석에 **왜 이 신호를 골랐는지**를 남긴다 —
6개월 뒤에 읽을 사람에게 필요한 건 설정값이 아니라 근거다.

```yaml
  - name: {ticket-lower}-watch
    desc: "{티켓} — 프로덕션 배포 감지 후 {N}일 이슈 감시"
    schedule: "*/10 * * * *"
    run: script
    script: tasks/{ticket-lower}-watch.sh
    notify: slack
    slack_target: default
    notify_on: change           # 정상 출력이 `OK` 고정이라 상태 전이에만 반응
    enabled: true
    timeout: 240                # 실측 4.4초. Logs Insights 지연 대비 여유
```

`run: script` 다. `run: claude`를 쓰면 안 되는 이유: 출력이 바이트 안정이 아니라
`notify_on: change`의 digest가 매 틱 바뀌고, 인시던트가 지속되는 내내 10분마다
알림이 간다. 게다가 3일이면 432회 실행이다.

그다음:

```bash
cd ~/plab/jobs && ./bin/jobs sync
```

### Step 6: 검증 — 알림 경로를 반드시 한 번 돌려본다

```bash
cd ~/plab/jobs
./tasks/{ticket-lower}-watch.sh                      # 1) WAITING (베이스라인 arm)
./tasks/{ticket-lower}-watch.sh                      # 2) WAITING 동일 → 무음 확인
./tasks/{ticket-lower}-watch.sh status               # 3) baseline_version 확인
```

**트립 경로를 실제로 렌더시켜 볼 것.** 안 하면 알림 코드가 사고 당일에 처음
실행된다. 임시 상태 파일로 `WATCHING`을 강제하고, 필요하면
`SENTRY_ENVS=dev` 처럼 이벤트가 있는 쪽을 겨눠 render를 확인한다.

**digest 안정성 테스트는 필수다:**

```bash
A=$(WATCH_STATE=/tmp/t.json ./tasks/{x}-watch.sh | shasum)
B=$(WATCH_STATE=/tmp/t.json ./tasks/{x}-watch.sh | shasum)
[ "$A" = "$B" ] && echo "✅ 안정" || echo "❌ 매 틱 알림 간다"
```

**일시 실패 게이트도 확인한다.** 첫 실전 오탐(2026-08-12)이 정확히 이 미검증
경로에서 났다 — 조회 타임아웃 1회가 영구 트립을 만들었다.

```bash
cat > /tmp/fs.json <<'EOF'
{"phase":"WATCHING","ticket":"T","baseline_version":"a","deploy_version":"v",
 "deploy_detected_at":"2026-01-01T00:00:00+00:00","events":[],"seen":[],"fail_streak":{}}
EOF
for i in 1 2 3; do
  env TICKET=T SENTRY_PROJECTS="" LOG_GROUP="" EXTRA_CHECK_CMD='exit 7' \
      WATCH_STATE=/tmp/fs.json ./tasks/{x}-watch.sh | head -1
done
# 기대: OK / OK / 이슈 감지   (1·2회 무음, 3회째 승격)
```

마지막으로 `bin/jobs run {name}` 으로 Slack 까지 한 번 통과시킨다.

### Step 7: 케이스 로그 예약

`cases.md`에 행을 추가한다. `결과`는 스크립트가 DONE 때 자동으로 쓰므로
`예상 실패모드`와 `고른 신호`만 채우고, 상태 파일에도 같은 값을 심어 둔다:

```bash
jq '.planned_failure_mode="자격증명 예외" | .planned_signals="로그+Sentry+EB"' \
  state/{x}-watch-phase.json > /tmp/s && mv /tmp/s state/{x}-watch-phase.json
```

`판정` 칸은 **비워 둔다.** 사람 몫이다.

---

## 리포트 형식

```
📡 배포 감시 잡 생성 — {티켓} (PR #{N})

  변경        {제목}
  실패 모드    {분류} ← {diff 근거}

  계기 자격 검사
    {endpoint}  {일 요청}/day → {10분당}건  {가능|실격}
    → {선택한 계기와 그 이유}

  고른 신호        베이스라인(배포 전)
    {신호}          {실측값}

  의도적 비관측    {안 보기로 한 것 + 이유}

  산출물
    tasks/{x}-watch.sh
    jobs.yaml: {x}-watch  (*/10, {N}일, → #{채널})

  검증
    WAITING arm    ✅        digest 안정성  ✅
    트립 렌더       ✅        Slack 경로     ✅

  감시 시작은 {배포 감지 방식} 변화 시점. 지금은 WAITING.
```

`의도적 비관측`을 빼지 말 것. 무엇을 안 보기로 했는지가 없으면 3일 뒤 무음일 때
"이상 없음"인지 "안 보고 있었음"인지 구분이 안 된다.

## Error Handling

| 상황 | 대응 |
|---|---|
| PR 미머지 | 그대로 진행 가능 — 배포 감지가 자동이라 미리 arm 해도 된다. 다만 diff는 확정본이 아님을 명시 |
| 릴리스 PR | Step 0에서 feature PR로 되짚는다. 릴리스 묶음 자체는 감시 대상 아님 |
| 엔드포인트 추적 실패 | 레이턴시 신호 포기, 예외 신호로. "추적 실패" 를 리포트에 남길 것 |
| 신호를 하나도 못 고름 | 잡을 만들지 말고 그 사실을 보고한다. 빈 감시 잡은 "이상 없음"으로 오독된다 |
| `jobs-tools` venv 없음 | `pyenv virtualenv 3.13.2 jobs-tools && ~/.pyenv/versions/jobs-tools/bin/python -m pip install boto3` |

## Notes

- 감시 잡은 T0+N일에 스스로 `DONE`이 된다. `enabled: false`를 기억할 필요 없다.
- 잡 정리는 여유 있게: `jobs.yaml` 에서 항목 제거 → `bin/jobs sync`.
- 트립하면 `/ops:deploy-triage {티켓}` 으로 진단한다.
