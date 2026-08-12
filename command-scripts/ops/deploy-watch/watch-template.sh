#!/usr/bin/env bash
# 배포 감시 잡 템플릿 — 티켓별 감시 스크립트의 골격.
#
# ⚠️ 이 파일은 **동결된 산출물**이다. `/ops:deploy-watch` 가 이걸 복사한 뒤
#    아래 "티켓별 설정" 블록만 채운다. 골격을 매번 새로 생성하지 않는 이유는
#    여기 든 정확성이 전부 비싸게 산 것이기 때문이다 (2026-08-12 DEV-7711):
#
#    · 내장 hash() 대신 hashlib — PYTHONHASHSEED 가 프로세스마다 달라서
#      같은 로그 줄이 매 틱 다른 signature 를 받는다. 중복 제거가 죽고
#      3일 내내 10분마다 알림이 간다. 감시 잡을 만든 이유를 정확히 무효화한다.
#    · 정상 출력이 `OK` 한 단어 — 경과시간·건수를 넣으면 digest 가 매 틱 바뀐다.
#    · 이벤트 누적 — 인시던트는 지속된다. 매 틱 새로 서술하면 지속되는 내내
#      알림이 온다. 이미 정신없을 때 정확히 그렇다.
#    · T0 는 배포 시스템이 기록한 시각 — 머지 시각도, 스크립트가 깨어난 시각도 아니다.
#    · 조회 실패는 연속 3회부터 이벤트 — 이벤트가 누적되고 안 지워지므로 네트워크가
#      한 번 튄 것이 남은 감시 기간 내내 트립 상태로 굳는다. 그러면 진짜 이벤트가
#      이미 울고 있는 알림에 묻힌다. 감시 잡의 자기 고장과 감시 대상의 고장은
#      임계가 달라야 한다 (2026-08-12 실측: Sentry timeout 1회로 영구 트립).
#
#    모델이 이 골격을 다시 써내면 위 수정들이 조용히 사라진다. 복사할 것.
#
# 사용:
#   <ticket>-watch.sh           상태 머신 1틱 (jobs.yaml 경로)
#   <ticket>-watch.sh status    상태만 출력, 변경 없음
#   <ticket>-watch.sh reset     베이스라인 재설정
#
# ── 출력 계약 (run-job 의 notify_on: change 와 맞물린다) ──────────────────
# run-job 은 출력 전체의 sha256 을 이전 값과 비교해 다를 때만 Slack 을 보낸다.
# 따라서 정상 출력은 바이트 단위로 고정이어야 한다.
#
#   WAITING → OK      배포 감지, 감시 시작
#   OK      → 이벤트   새 이슈 발생
#   이벤트   → 이벤트+1 이슈 추가
#   ...     → DONE    WATCH_DAYS 만료, 자동 종료
#
# 3일 종료가 스크립트 안에 있는 이유: cron 에는 종료일이 없다. `enabled: false`
# 를 사람이 기억하는 구조는 언젠가 잊어서 몇 달째 도는 잡이 된다.
set -uo pipefail

# ══════════════════════════════════════════════════════════════════════
# 티켓별 설정 — /ops:deploy-watch 가 채우는 곳. 여기 말고는 건드리지 말 것.
# ══════════════════════════════════════════════════════════════════════
TICKET="${TICKET:-TICKET-UNSET}"
WATCH_DAYS="${WATCH_DAYS:-3}"

# 배포 감지 방식: eb | ecs
#   eb  — Elastic Beanstalk VersionLabel 변화  (pf-server-django)
#   ecs — ECS 서비스의 task definition revision 변화 (social-backend-fastapi 등)
DEPLOY_DETECT="${DEPLOY_DETECT:-eb}"
EB_APP="${EB_APP:-prod}"
EB_ENV="${EB_ENV:-Prod-env-1}"
ECS_CLUSTER="${ECS_CLUSTER:-}"
ECS_SERVICE="${ECS_SERVICE:-}"

# 신호 1 — 애플리케이션 로그. 비우면 이 체크를 건너뛴다.
LOG_GROUP="${LOG_GROUP:-}"
LOG_PATTERN="${LOG_PATTERN:-}"

# 신호 2 — Sentry. 비우면 건너뛴다.
SENTRY_PROJECTS="${SENTRY_PROJECTS:-}"
SENTRY_ENVS="${SENTRY_ENVS:-prod,production}"
# 이 정규식에 걸리는 신규 이슈 유형은 🔴 로 표시한다 (이 티켓과 직접 관련).
CRITICAL_TYPES="${CRITICAL_TYPES:-}"

# 신규성을 "이슈 ID" 가 아니라 "실패 유형" 으로 판정한다.
#
# Sentry 는 예외 메시지 문자열이 조금만 달라져도 새 이슈 ID 를 발급한다. 만성
# 오류는 이 때문에 배포와 무관하게 계속 새 ID 로 태어나고, firstSeen 필터만
# 쓰면 그게 전부 "배포 후 신규" 로 잡힌다.
#
# 실측 (2026-08-12 DEV-7711, 배포 +3h39m):
#   RainForecastRequestModuleError 2건이 신규로 잡혀 알림이 나갔다. 그런데 같은
#   예외 클래스는 firstSeen 2026-05-14 로 3개월째 상시(누적 2318+384건)였고,
#   업스트림(apis.data.go.kr)이 timeout 대신 connection reset 으로 끊으면서
#   메시지가 바뀌어 그룹만 갈린 것이었다. 코드 경로도 안 겹친다
#   (web/weather/ 에 boto3 참조 0건, 30일간 커밋 0건).
#
# 그래서 후보 이슈마다 `error.type:<타입>` 으로 14일을 되짚어 T0 이전에 같은
# 유형이 이미 있었으면 억제한다. 조회가 실패하면 억제하지 않는다 — 감시를
# 조용히 만드는 쪽으로는 절대 실패하지 않게 한다.
SENTRY_CLASS_NOVELTY="${SENTRY_CLASS_NOVELTY:-1}"

# 최후의 수동 제외 장치. `타입` 또는 `culprit` 에 걸리면 이벤트로 안 만든다.
# 위 유형 신규성으로 대부분 걸러지므로 기본은 비어 있다. 유형 자체가 진짜
# 신규인데 이 배포와 코드 경로가 겹칠 수 없는 게 확실할 때만 채울 것.
SENTRY_EXCLUDE="${SENTRY_EXCLUDE:-}"

# 신호 3 — 임의 체크. 위 메뉴로 안 되는 신호를 위한 확장점.
# stdout 한 줄이 이벤트 하나가 된다. 출력이 없으면 정상으로 본다.
# 예: 슬로우 쿼리 건수, row count 정합성, Datadog 임계 초과 여부.
# ⚠️ 출력은 안정적이어야 한다 — 매번 변하는 숫자를 뱉으면 매 틱 알림이 간다.
#    "임계를 넘었다" 같은 판정만 내보낼 것. 건수를 그대로 흘리지 말 것.
EXTRA_CHECK_CMD="${EXTRA_CHECK_CMD:-}"

# 알림 하단에 붙는 조사 순서. 이 티켓을 모르는 사람이 새벽에 읽는다고 가정하고 쓴다.
TRIAGE_HINT="${TRIAGE_HINT:-}"
# ══════════════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY="${PLAB_PYTHON:-$HOME/.pyenv/versions/jobs-tools/bin/python}"
MODE="${1:-run}"

export AWS_PROFILE="${AWS_PROFILE:-plab}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-ap-northeast-2}"

# 상태 파일에 -phase 를 붙이는 이유: run-job 이 state/<잡이름>.json 을 자기 것으로
# 쓴다(last_digest 보관). 같은 경로면 서로 덮어써서 알림 판정이 깨진다.
# ${TICKET,,} 를 쓰지 않는 이유: macOS 기본 bash 는 3.2 라 소문자 확장이 없다
# (`bad substitution`). 이 스크립트는 launchd 가 부르므로 조용히 죽는다.
TICKET_LC="$(printf '%s' "$TICKET" | tr '[:upper:]' '[:lower:]')"
STATE="${WATCH_STATE:-$ROOT/state/${TICKET_LC}-watch-phase.json}"

# 감시 결과를 축적하는 곳. DONE 전이 때 한 줄 append 한다. 다음 /ops:deploy-watch
# 가 이걸 읽는다 — 이게 없으면 "무엇을 골랐나"만 쌓이고 "그게 맞았나"는 안 쌓인다.
CASES_FILE="${CASES_FILE:-$HOME/.claude/command-scripts/ops/deploy-watch/cases.md}"

if [ -n "$SENTRY_PROJECTS" ] && [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "SENTRY_PROJECTS 가 설정됐는데 SENTRY_AUTH_TOKEN 이 비어 있다 — ~/.zshenv 확인" >&2
  exit 1
fi

# 조직 슬러그가 비면 Sentry URL 이 조용히 깨져서 매 틱 조회 실패로 떨어진다.
# 그러면 감시가 눈이 먼 채로 도는데 출력은 그럴듯하다 — 여기서 잡는다.
if [ -n "$SENTRY_PROJECTS" ] && [ -z "${SENTRY_ORG:-${PLAB_GH_ORG:-}}" ]; then
  echo "SENTRY_ORG / PLAB_GH_ORG 가 둘 다 비어 있다 — ~/.zshenv 확인" >&2
  exit 1
fi

if [ ! -x "$PY" ]; then
  echo "python 인터프리터 없음: $PY" >&2
  echo "  pyenv virtualenv 3.13.2 jobs-tools && $PY -m pip install boto3" >&2
  exit 1
fi

# -W ignore: 라이브러리 경고가 stderr 로 새면 Slack 본문과 digest 를 오염시킨다.
MODE="$MODE" STATE_PATH="$STATE" CASES_PATH="$CASES_FILE" \
TICKET="$TICKET" WATCH_DAYS="$WATCH_DAYS" \
DEPLOY_DETECT="$DEPLOY_DETECT" EB_APP="$EB_APP" EB_ENV="$EB_ENV" \
ECS_CLUSTER="$ECS_CLUSTER" ECS_SERVICE="$ECS_SERVICE" \
LOG_GROUP="$LOG_GROUP" LOG_PATTERN="$LOG_PATTERN" \
SENTRY_PROJECTS="$SENTRY_PROJECTS" SENTRY_ENVS="$SENTRY_ENVS" \
CRITICAL_TYPES="$CRITICAL_TYPES" EXTRA_CHECK_CMD="$EXTRA_CHECK_CMD" \
SENTRY_CLASS_NOVELTY="$SENTRY_CLASS_NOVELTY" SENTRY_EXCLUDE="$SENTRY_EXCLUDE" \
TRIAGE_HINT="$TRIAGE_HINT" \
"$PY" -W ignore - <<'PYEOF'
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import boto3

UTC = dt.timezone.utc
KST = dt.timezone(dt.timedelta(hours=9))

MODE = os.environ["MODE"]
STATE_PATH = pathlib.Path(os.environ["STATE_PATH"])
CASES_PATH = pathlib.Path(os.environ["CASES_PATH"])
TICKET = os.environ["TICKET"]
WATCH_DAYS = float(os.environ["WATCH_DAYS"])
REGION = os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-2")

DEPLOY_DETECT = os.environ["DEPLOY_DETECT"]
EB_APP, EB_ENV = os.environ["EB_APP"], os.environ["EB_ENV"]
ECS_CLUSTER, ECS_SERVICE = os.environ["ECS_CLUSTER"], os.environ["ECS_SERVICE"]

LOG_GROUP = os.environ["LOG_GROUP"]
LOG_PATTERN = os.environ["LOG_PATTERN"]
# 조직 슬러그는 하드코딩하지 않는다 — 이 저장소는 public 이고, 업무 식별자는
# 환경변수로 넘기는 것이 기존 관례다 ($PLAB_GH_ORG, ~/.zshenv).
SENTRY_ORG = os.environ.get("SENTRY_ORG") or os.environ.get("PLAB_GH_ORG", "")
SENTRY_PROJECTS = [p for p in os.environ["SENTRY_PROJECTS"].split(",") if p]
SENTRY_ENVS = [e for e in os.environ["SENTRY_ENVS"].split(",") if e]
CRITICAL_TYPES = os.environ["CRITICAL_TYPES"]
CLASS_NOVELTY = os.environ.get("SENTRY_CLASS_NOVELTY", "1") == "1"
SENTRY_EXCLUDE = os.environ.get("SENTRY_EXCLUDE", "")
EXTRA_CHECK_CMD = os.environ["EXTRA_CHECK_CMD"]
TRIAGE_HINT = os.environ["TRIAGE_HINT"]

# 조회 창을 주기(10분)보다 넓게 잡는다. 로그 수집과 Sentry 색인에 지연이 있어
# 정확히 10분만 보면 경계에 걸친 건을 통째로 놓친다. 겹치는 만큼 같은 건이 두 번
# 잡히지만 signature 중복 제거가 걸러낸다.
LOOKBACK_MIN = int(os.environ.get("WATCH_LOOKBACK_MIN", "20"))

# 조회 실패(타임아웃·5xx)를 곧바로 이벤트로 만들지 않는다. 이벤트는 누적되고
# 지워지지 않으므로 네트워크 한 번 튄 것이 남은 감시 기간 내내 트립 상태로 굳는다.
# 그러면 진짜 이벤트가 이미 울고 있는 알림에 묻힌다 (2026-08-12 DEV-7711 실측:
# Sentry read timeout 1회로 감시가 영구 트립됐다).
#
# 그렇다고 조용히 넘기지도 않는다 — 조회가 계속 실패하면 감시 잡이 눈이 먼 것이고
# 그건 진짜로 알아야 한다. 연속 N회(기본 3회 = 약 30분)부터 이벤트로 올린다.
FAIL_STREAK_THRESHOLD = int(os.environ.get("WATCH_FAIL_STREAK", "3"))

LOG_RE = re.compile(LOG_PATTERN, re.I) if LOG_PATTERN else None
CRIT_RE = re.compile(CRITICAL_TYPES, re.I) if CRITICAL_TYPES else None
EXCL_RE = re.compile(SENTRY_EXCLUDE, re.I) if SENTRY_EXCLUDE else None


def now():
    return dt.datetime.now(UTC)


def kst(ts):
    return ts.astimezone(KST).strftime("%m-%d %H:%M")


def load_state():
    if STATE_PATH.exists():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {}


def save_state(st):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps(st, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


# ── 배포 감지 ────────────────────────────────────────────────────────────
# 머지 시각을 쓰지 않는 이유: 릴리스 브랜치 → main → CodePipeline → 배포 체인에서
# 머지와 실제 배포 사이에 빌드와 **수동 승인 게이트**가 있다. 실측(2026-08-12
# DEV-7711)으로 머지 14:26 이후 Manual 스테이지에서 대기 상태였다. 머지 시각을
# T0 로 잡으면 배포 전 코드를 재는 창이 만들어진다.
def deploy_state():
    if DEPLOY_DETECT == "eb":
        eb = boto3.client("elasticbeanstalk", region_name=REGION)
        r = eb.describe_environments(
            ApplicationName=EB_APP, EnvironmentNames=[EB_ENV], IncludeDeleted=False
        )
        envs = r.get("Environments") or []
        if not envs:
            raise RuntimeError(f"EB 환경을 못 찾음: {EB_APP}/{EB_ENV}")
        e = envs[0]
        return {
            "version": e.get("VersionLabel") or "",
            "status": e.get("Status") or "",
            "health": e.get("Health") or "",
            "health_status": e.get("HealthStatus") or "",
            "updated_at": e["DateUpdated"].astimezone(UTC).isoformat(),
        }

    if DEPLOY_DETECT == "ecs":
        ecs = boto3.client("ecs", region_name=REGION)
        r = ecs.describe_services(cluster=ECS_CLUSTER, services=[ECS_SERVICE])
        svcs = r.get("services") or []
        if not svcs:
            raise RuntimeError(f"ECS 서비스를 못 찾음: {ECS_CLUSTER}/{ECS_SERVICE}")
        s = svcs[0]
        primary = next(
            (d for d in s.get("deployments", []) if d.get("status") == "PRIMARY"),
            None,
        )
        td = (primary or {}).get("taskDefinition") or s.get("taskDefinition") or ""
        upd = (primary or {}).get("updatedAt") or s.get("createdAt")
        healthy = (
            "Green"
            if primary and primary.get("runningCount") == primary.get("desiredCount")
            else "Degraded"
        )
        return {
            "version": td,
            "status": "Ready" if (primary or {}).get("rolloutState") == "COMPLETED" else "Updating",
            "health": healthy,
            "health_status": (primary or {}).get("rolloutState") or "",
            "updated_at": upd.astimezone(UTC).isoformat(),
        }

    raise RuntimeError(f"알 수 없는 DEPLOY_DETECT: {DEPLOY_DETECT}")


def check_health(env):
    """배포 중에는 Grey/Degraded 를 지나가므로 그것만으로는 이벤트로 치지 않는다.
    안정 상태(Ready)인데 건강하지 않은 경우만 잡는다."""
    if env["status"] == "Ready" and env["health"] not in ("Green", ""):
        return [{
            "sig": f"health:{env['health']}:{env['health_status']}",
            "text": f"🔴 배포 환경 health={env['health']} "
                    f"({env['health_status']}) status={env['status']}",
        }]
    return []


# ── 신호 1: 애플리케이션 로그 ────────────────────────────────────────────
def scan_logs(since):
    """filter_log_events 가 아니라 Logs Insights 를 쓰는 이유: filter 계열은
    페이지네이션 때문에 건수가 잘려 나올 수 있고, 잘렸다는 사실이 드러나지 않는다.
    Insights 는 서버에서 집계하고 상태를 같이 돌려준다."""
    if not LOG_GROUP or not LOG_PATTERN:
        return []
    logs = boto3.client("logs", region_name=REGION)
    q = logs.start_query(
        logGroupName=LOG_GROUP,
        startTime=int(since.timestamp()),
        endTime=int(now().timestamp()),
        queryString=(
            "fields @timestamp, @message "
            f"| filter @message like /(?i)({LOG_PATTERN})/ "
            "| sort @timestamp desc | limit 20"
        ),
    )
    qid = q["queryId"]
    for _ in range(40):  # 최대 약 60초
        r = logs.get_query_results(queryId=qid)
        if r["status"] in ("Complete", "Failed", "Cancelled", "Timeout"):
            break
        time.sleep(1.5)
    else:
        r = logs.get_query_results(queryId=qid)

    if r["status"] != "Complete":
        return [{"sig": f"logs-query-{r['status']}", "transient": True,
                 "text": f"로그 조회가 끝나지 않음 (status={r['status']})"}]

    out = []
    for row in r.get("results", []):
        d = {f["field"]: f["value"] for f in row}
        msg = (d.get("@message") or "").strip()
        m = LOG_RE.search(msg) if LOG_RE else None
        kind = m.group(0) if m else "match"
        # 타임스탬프·긴 숫자를 지워 같은 예외를 한 이벤트로 접는다. 건수를 세지
        # 않는 이유는 출력 계약 때문 — 숫자가 매 틱 변하면 계속 알림이 간다.
        norm = re.sub(r"\d{4}-\d{2}-\d{2}[T ][\d:.,]+", "", msg)
        norm = re.sub(r"\b\d{6,}\b", "N", norm)[:160]
        # 내장 hash() 금지 — PYTHONHASHSEED 가 프로세스마다 달라 signature 가
        # 매 틱 바뀐다. 중복 제거가 죽는다.
        digest = hashlib.sha1(norm.encode("utf-8")).hexdigest()[:6]
        out.append({"sig": f"log:{kind.lower()}:{digest}",
                    "text": f"{kind} — {msg[:220]}"})
    return out


# ── 신호 2: Sentry ───────────────────────────────────────────────────────
def sentry_get(path, params):
    url = "https://sentry.io/api/0" + path
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(
        url, headers={"Authorization": "Bearer " + os.environ["SENTRY_AUTH_TOKEN"]}
    )
    # 한 번 튀는 것은 여기서 흡수한다. 그래도 실패하면 위 FAIL_STREAK 로 넘어간다.
    last = None
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read().decode())
        except Exception as exc:
            last = exc
            if attempt == 0:
                time.sleep(2)
    raise last


def class_predates_deploy(proj, env, typ, t0, cache):
    """이 예외 유형이 T0 이전에도 있었나.

    True 면 배포가 만든 게 아니다 — 이슈 ID 만 새로 발급된 만성 오류다.
    조회 실패 시 False (= 억제하지 않음). 감시가 조용해지는 쪽으로는 실패시키지
    않는다 — 놓치는 것이 시끄러운 것보다 나쁘다.
    """
    if not typ or typ == "?":
        return False
    key = (proj, env, typ)
    if key in cache:
        return cache[key]
    verdict = False
    try:
        siblings = sentry_get(
            f"/projects/{SENTRY_ORG}/{proj}/issues/",
            {"query": f'error.type:"{typ}"', "statsPeriod": "14d", "environment": env},
        )
        if isinstance(siblings, list):
            for sib in siblings:
                seen_at = sib.get("firstSeen")
                if not seen_at:
                    continue
                try:
                    first = dt.datetime.fromisoformat(seen_at.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if first < t0:
                    verdict = True
                    break
    except Exception:
        verdict = False
    cache[key] = verdict
    return verdict


def scan_sentry(since, t0=None):
    """배포 이후 **새로 나타난 이슈 유형**만 잡는다.

    is:unresolved 전체는 신호가 안 된다 — 프로덕션 기준 24시간에 100건이다.
    firstSeen 으로 좁히면 베이스라인이 하루 약 1건으로 떨어진다.
    """
    if not SENTRY_PROJECTS:
        return []
    minutes = max(LOOKBACK_MIN, int((now() - since).total_seconds() // 60) + 1)
    out = []
    novelty_cache = {}
    for proj in SENTRY_PROJECTS:
        for env in SENTRY_ENVS:
            try:
                issues = sentry_get(
                    f"/projects/{SENTRY_ORG}/{proj}/issues/",
                    {
                        "query": f"is:unresolved firstSeen:-{minutes}m",
                        "statsPeriod": "24h",
                        "environment": env,
                    },
                )
            except Exception as exc:  # 조회 실패를 조용히 넘기지 않는다
                out.append({"sig": f"sentry-error:{proj}:{env}", "transient": True,
                            "text": f"Sentry 조회 실패 {proj}/{env}: {exc}"})
                continue
            if not isinstance(issues, list):
                continue
            for it in issues:
                meta = it.get("metadata") or {}
                typ = meta.get("type") or it.get("title") or "?"
                val = meta.get("value") or ""
                culprit = it.get("culprit") or ""

                # 수동 제외 — 유형/culprit 어느 쪽에 걸려도 뺀다.
                if EXCL_RE and (EXCL_RE.search(typ) or EXCL_RE.search(culprit)):
                    continue

                # 유형 신규성 — 이 예외 클래스가 T0 이전에도 있었으면 배포 무관.
                # 🔴(이 티켓과 직접 관련된 자격증명 계열)는 억제하지 않는다.
                # 자격증명 오류는 만성일 수가 없고, 만에 하나 이전에도 있었다면
                # 그건 오히려 사람이 봐야 하는 사실이다.
                is_crit = bool(CRIT_RE and CRIT_RE.search(typ))
                if (
                    CLASS_NOVELTY
                    and not is_crit
                    and t0 is not None
                    and class_predates_deploy(proj, env, typ, t0, novelty_cache)
                ):
                    continue

                tag = "🔴" if is_crit else "🟡"
                out.append({
                    "sig": f"sentry:{it.get('id')}",
                    "text": (f"{tag} {proj}/{env} {typ}\n"
                             f"        {culprit[:70]}\n"
                             f"        {val[:180]}").rstrip(),
                })
    return out


# ── 신호 3: 임의 체크 ────────────────────────────────────────────────────
def scan_extra():
    if not EXTRA_CHECK_CMD:
        return []
    try:
        p = subprocess.run(EXTRA_CHECK_CMD, shell=True, capture_output=True,
                           text=True, timeout=90)
    except Exception as exc:
        return [{"sig": "extra-error", "transient": True, "text": f"추가 체크 실행 실패: {exc}"}]
    if p.returncode != 0 and not p.stdout.strip():
        return [{"sig": "extra-rc", "transient": True,
                 "text": f"추가 체크 rc={p.returncode}: {(p.stderr or '')[:200]}"}]
    out = []
    for line in p.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        digest = hashlib.sha1(line.encode("utf-8")).hexdigest()[:6]
        out.append({"sig": f"extra:{digest}", "text": f"🔴 {line[:220]}"})
    return out


# ── 출력 ─────────────────────────────────────────────────────────────────
def render(st):
    ev = st.get("events", [])
    if not ev:
        return "OK"
    t0 = dt.datetime.fromisoformat(st["deploy_detected_at"])
    lines = [
        f"{TICKET} WATCH — 이슈 감지",
        "",
        f"배포 버전 : {st.get('deploy_version', '?')}",
        f"배포 시각 : {kst(t0)} KST",
        "",
    ]
    for i, e in enumerate(ev, 1):
        at = dt.datetime.fromisoformat(e["at"])
        lines.append(f"[{i}] {kst(at)}  {e['text']}")
    if TRIAGE_HINT:
        lines += ["", TRIAGE_HINT]
    lines += ["", f"진단: /ops:deploy-triage {TICKET}"]
    return "\n".join(lines)


def append_case(st):
    """DONE 전이 때 한 줄 남긴다. `판정` 칸은 비워 둔다 — 그게 사람 몫이고,
    빈칸도 데이터다(그날 게이트가 형식이었다는 기록)."""
    ev = st.get("events", [])
    outcome = "무음" if not ev else f"이벤트 {len(ev)}건"
    row = (f"| {kst(now())[:5]} | {TICKET} | {st.get('planned_failure_mode', '?')} "
           f"| {st.get('planned_signals', '?')} | {outcome} | |")
    try:
        CASES_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CASES_PATH.open("a", encoding="utf-8") as f:
            f.write(row + "\n")
    except Exception:
        pass  # 로그 축적 실패가 감시 잡을 죽이면 안 된다


def main():
    st = load_state()

    if MODE == "status":
        print(json.dumps(st, ensure_ascii=False, indent=2, sort_keys=True))
        return 0

    if MODE == "reset":
        if STATE_PATH.exists():
            STATE_PATH.unlink()
        print("상태 초기화됨 — 다음 틱에서 현재 배포 버전을 베이스라인으로 잡는다")
        return 0

    phase = st.get("phase")

    # 최초 실행: 지금 프로덕션에 떠 있는 버전을 베이스라인으로 박는다.
    if phase is None:
        env = deploy_state()
        st = {
            "phase": "WAITING",
            "ticket": TICKET,
            "baseline_version": env["version"],
            "baseline_updated_at": env["updated_at"],
            "armed_at": now().isoformat(),
            "events": [],
            "seen": [],
        }
        save_state(st)
        print("WAITING")
        return 0

    if phase == "DONE":
        print("DONE")
        return 0

    if phase == "WAITING":
        env = deploy_state()
        if env["version"] == st["baseline_version"]:
            print("WAITING")
            return 0
        st["phase"] = "WATCHING"
        st["deploy_version"] = env["version"]
        st["deploy_detected_at"] = env["updated_at"]
        st["previous_version"] = st["baseline_version"]
        save_state(st)
        phase = "WATCHING"

    # ── WATCHING ────────────────────────────────────────────────────────
    t0 = dt.datetime.fromisoformat(st["deploy_detected_at"])
    if now() - t0 > dt.timedelta(days=WATCH_DAYS):
        st["phase"] = "DONE"
        st["finished_at"] = now().isoformat()
        if not st.get("case_logged"):
            append_case(st)
            st["case_logged"] = True
        save_state(st)
        print("DONE")
        return 0

    since = max(t0, now() - dt.timedelta(minutes=LOOKBACK_MIN))

    found = []
    try:
        found += check_health(deploy_state())
    except Exception as exc:
        found.append({"sig": "deploy-error", "transient": True, "text": f"배포 상태 조회 실패: {exc}"})
    try:
        found += scan_logs(since)
    except Exception as exc:
        found.append({"sig": "logs-error", "transient": True, "text": f"로그 조회 실패: {exc}"})
    found += scan_sentry(since, t0)
    found += scan_extra()

    # 일시 실패(조회 타임아웃 등)는 연속 발생해야 이벤트가 된다. 이번 틱에 안 뜬
    # 실패는 streak 를 0 으로 되돌린다 — 어제 한 번 튄 것이 오늘 것과 합산되면
    # 임계가 무의미해진다.
    streak = st.get("fail_streak", {})
    hit = {f["sig"] for f in found if f.get("transient")}
    for sig in list(streak):
        if sig not in hit:
            streak.pop(sig)
    for sig in hit:
        streak[sig] = streak.get(sig, 0) + 1

    seen = set(st.get("seen", []))
    for f in found:
        if f["sig"] in seen:
            continue
        if f.get("transient") and streak.get(f["sig"], 0) < FAIL_STREAK_THRESHOLD:
            continue  # 아직 일시적일 수 있다. 다음 틱에서 다시 본다
        seen.add(f["sig"])
        text = f["text"]
        if f.get("transient"):
            text = f"⚠️ 감시 잡 조회 실패 {streak.get(f['sig'], 0)}회 연속 — {text}"
        st.setdefault("events", []).append(
            {"at": now().isoformat(), "sig": f["sig"], "text": text}
        )
    st["seen"] = sorted(seen)
    st["fail_streak"] = streak
    save_state(st)

    print(render(st))
    return 0


sys.exit(main())
PYEOF
