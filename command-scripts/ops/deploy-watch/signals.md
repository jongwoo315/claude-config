# 배포 감시 신호 메뉴 + 환경 사실

`/ops:deploy-watch`와 `/ops:deploy-triage`가 공유한다.

> **이 목록은 소진 목록이 아니라 출발점이다.** 초판(2026-08-12)은 자격증명 PR
> 하나(DEV-7711)에서 나왔기 때문에 AWS·예외 쪽으로 편향돼 있다. 신호를 고르기
> 전에 반드시 먼저 물을 것: **"이 diff 에는 아래 메뉴에 없는 신호가 필요한가?"**
> N+1 쿼리, 마이그레이션, 캐시 무효화, 정산 로직은 여기 없는 신호를 요구한다.

---

## 실패 모드 → 신호 매핑

| 실패 모드 | diff의 냄새 | 봐야 할 것 | **보면 안 되는 것** |
|---|---|---|---|
| 예외 (자격증명·설정·의존성) | boto3/클라이언트 초기화, settings, env 키, 라이브러리 제거 | 앱 로그 예외 패턴, Sentry 신규 유형 | 레이턴시 — 실패가 즉시 예외라 p99가 안 움직인다 |
| 레이턴시 | 쿼리, 직렬화, N+1, 인덱스, 외부 호출 | APM p90/p95, 슬로우 쿼리 로그, RDS CPU | 예외 — 느려질 뿐 안 터진다 |
| 데이터 정합성 | 마이그레이션, 배치, 집계, 정산 | row count 대조, 합계 불변식, 스팟체크 SQL | APM 전부 — 조용히 틀린다 |
| API 계약 | serializer, 응답 스키마, 필드 추가/삭제 | FE Sentry(`new-plab-front`, `plab-fe`), 4xx 급증 | BE 5xx — BE는 200을 준다 |
| 처리량/용량 | 커넥션 풀, 워커 수, 타임아웃 | 풀 사용률, 큐 적체, ECS/EB 스케일 | 단건 레이턴시 |

---

## 계기 자격 검사 — 신호를 고르기 **전에**

가장 비싼 실수는 계기를 잘못 고르는 것이다. 레이턴시 기반 계기를 쓰려면
**영향 표면의 트래픽을 먼저 재라.**

```
10분 창의 요청 수 = (일 요청 수) / 144
```

`deploy-perf-report`의 `--min-reqs` 기본값이 10이다. 일 1,440건 미만이면
10분 창에서 통계가 성립하지 않는다.

DEV-7711 실측 (2026-08-12, Datadog 24h):

| resource_name | 일 요청 | 10분당 | 판정 |
|---|---:|---:|---|
| `get_api/v2/users/profile/` | 42 | 0.3 | 실격 |
| `get_api/v2/search/hotkeyword/` | 4 | 0.03 | 실격 |
| 프로필 이미지 업로드 | 0 | 0 | 실격 |
| (비교) `get_api/v2/matches/_p_pk_/._/` | 88,944 | 617 | 가능 |

산수라서 PR 유형과 무관하게 성립한다. **이 검사를 건너뛰지 말 것.**

---

## 배포 경계 — `merged_at`은 배포 시각이 아니다

`pf-server-django` 체인:

```
feature PR → release/YYMMDD-NN 브랜치 → test EB 환경
release PR → main → CodePipeline(pf-production-pipeline) → prod EB
```

`pf-production-pipeline` 스테이지: `Source → Build → Manual → Deploy → CloudFront-Cache-Clean`

**`Manual`은 사람 승인 게이트다.** 실측(2026-08-12 DEV-7711): 머지 14:26 →
Build 완료 14:29 → Manual 대기. 머지 시각을 T0로 잡으면 배포 전 코드를 재는
창이 만들어진다. 반드시 배포 시스템이 기록한 시각을 쓸 것.

| 레포 | 감지 방식 | 설정 |
|---|---|---|
| `pf-server-django` | `DEPLOY_DETECT=eb` | `EB_APP=prod` `EB_ENV=Prod-env-1` |
| `social-backend-fastapi` | `DEPLOY_DETECT=ecs` | `ECS_CLUSTER=social-prod-cluster` `ECS_SERVICE=social-backend-prod-service` |

---

## 신호별 접근 경로와 베이스라인

### 앱 로그 (CloudWatch Logs Insights)

```
pf-server-django prod:
  /aws/elasticbeanstalk/Prod-env-1/var/log/eb-docker/containers/eb-current-app/stdouterr.log
pf-server-django test:
  /aws/elasticbeanstalk/App-Test-env/var/log/eb-docker/containers/eb-current-app/stdouterr.log
```

`filter-log-events`가 아니라 Insights를 쓴다 — filter 계열은 페이지네이션으로
건수가 잘리는데 잘렸다는 사실이 드러나지 않는다.

자격증명 패턴 (2026-08-12 베이스라인: 24h 31,555건 스캔 → **0건**):
```
NoCredentialsError|PartialCredentials|Unable to locate credentials|
InvalidAccessKeyId|SignatureDoesNotMatch|ExpiredToken|AccessDenied|
InvalidClientTokenId|UnrecognizedClientException
```

### Sentry

org는 `$PLAB_GH_ORG` (~/.zshenv). 자격증명은 `$SENTRY_AUTH_TOKEN`.

| 프로젝트 | 대상 |
|---|---|
| `django` | pf-server-django 본체 |
| `plab-cron` | 스케줄러 / 배치 |
| `social-backend-fastapi` | BE 2.0 |
| `new-plab-front`, `plab-fe`, `plab-front` | FE (API 계약 파손이 여기 뜬다) |

⚠️ **환경 태그가 `prod`와 `production` 둘 다 살아 있다** (2026-08-12 실측:
`django` 기준 각각 100건 / 13건). 하나만 걸면 절반을 조용히 놓친다.

⚠️ `statsPeriod`는 `''`, `24h`, `14d`만 받는다. `90d`는 400.

**`is:unresolved` 전체는 신호가 안 된다** — 프로덕션 24시간에 100건이다.
`firstSeen:-Nm` 으로 좁히면 베이스라인이 **하루 약 1건**으로 떨어진다
(14일간 8건, 2026-08-12 기준 최근 24h 0건).

### APM (Datadog — pf-server-django 전용)

`trace.django.request{,.hits,.errors}` by `resource_name`. 보존 15일.

⚠️ **Grafana/AMP 에는 Django 지표가 없다.** AMP는 `social-backend-prod` /
`social-backend-staging`(BE 2.0)만 싣는다. Datadog→Grafana 이관 중이지만
v1 백엔드는 당분간 Datadog 전용이다.

### 배포 환경 상태

EB `describe-environments`의 `Health`/`Status`, ECS `describe-services`의
`rolloutState`. 배포 중에는 정상적으로 Degraded를 지나가므로 **안정 상태
(Ready/COMPLETED)인데 건강하지 않을 때만** 이벤트로 친다.

---

## APM 사각지대 — 놓치기 쉬운 곳

`trace.django.request`에 **안 잡히는** 것들. 자격증명·설정 변경은 대개 여기서 터진다.

- Celery 태스크 / 배치 (`stadium.tasks.*`, `plab-cron`)
- 푸시 발송 (`app_pushs/handlers.py`)
- 메시징 (`plab/messages/transporters.py`)
- 관리 커맨드, 스케줄 잡

실례: 2026-08-12 03:30 dev 에서 `ClientError: AccessDenied`가
`stadium.tasks.auto_reset_stadium_is_new` 에서 발생. `userCount 0`, APM 무흔적.
**Sentry만 봤다.** 웹 요청 경로 밖을 건드리는 PR이면 Sentry는 선택이 아니다.

---

## 출력 계약 (템플릿이 이미 지킨다 — 깨지 말 것)

- 정상 출력은 `OK` **한 단어**. 경과시간·건수를 넣으면 digest가 매 틱 바뀐다.
- 이벤트는 누적하고 signature로 중복 제거. 인시던트는 지속되므로 매 틱 새로
  서술하면 지속되는 내내 알림이 온다.
- signature 해시는 `hashlib`. 내장 `hash()`는 `PYTHONHASHSEED`가 프로세스마다
  달라 중복 제거가 죽는다.
- `EXTRA_CHECK_CMD`는 **판정만** 내보낼 것. 매번 변하는 숫자를 흘리면 매 틱 알림.
- macOS 기본 bash는 3.2 — `${VAR,,}` 같은 4.x 문법 금지.
