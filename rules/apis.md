## Notion API

- `~/work/*`, `~/plab/*` 또는 plab/plabfootball 관련 Notion 페이지 → `PLAB_WOZ_NOTION_API_KEY`
- `~/prv/*` 및 그 외 → `NOTION_API_KEY`

### 자주 쓰는 페이지

| 페이지        | 용도                        | Database ID                            |
| ------------- | --------------------------- | -------------------------------------- |
| 프로젝트 진행 | 개인 태스크 트래킹 (DEV-xx) | `29241e61-65c0-801f-9529-cabf8cad919b` |
| Dev Scraps    | TIL, 개념 정리, 기술 스크랩 | `76e9673e-d91b-41b2-9779-c0940040f542` |

**프로젝트 작업 컨텍스트에서는 "프로젝트 진행" 페이지를 최우선으로 참고할 것.**

### Notion 검색

- 태스크 검색 시 프로퍼티 기반 조회 사용 (제목 검색 대신)
- 예: `프로젝트`, `상태`, `ID` 프로퍼티로 필터링

### 페이지 작성 포맷

**모든 Notion 페이지에 적용된다.** 스크랩·TDR·TIL·태스크 본문 전부. 스킬마다
따로 적지 말고 여기를 따를 것 — 사본을 두면 갈라진다.

| 규칙 | 내용 |
| --- | --- |
| 헤딩 | **h2, h3만.** h1 금지, h4 이하 금지 |
| h2 색 | `"color": "yellow_background"` |
| h3 색 | `"color": "gray_background"` |
| 빈 문단 | **h2 앞에만** 하나 (첫 h2 제외). **h3 앞에는 넣지 않는다** |
| 구분선 | `divider` **금지** |
| 취소선 | `strikethrough` **금지** |
| 코드 | 원문에 코드가 있으면 code block으로 살린다 |

```json
{ "type": "heading_2",
  "heading_2": { "rich_text": [{"text":{"content":"제목"}}],
                 "color": "yellow_background" } },
{ "type": "paragraph", "paragraph": { "rich_text": [] } },   ← h2 앞 빈 문단
{ "type": "heading_3",
  "heading_3": { "rich_text": [{"text":{"content":"소제목"}}],
                 "color": "gray_background" } }
```

**셸에서 JSON을 직접 조립하지 말 것.** 한글 프로퍼티명과 긴 본문이 섞여 따옴표
사고가 난다. python으로 payload 파일을 만든 뒤 `--data-binary @file`로 보낸다.

#### 기존 블록 고치기 — `PATCH /v1/blocks/{block_id}`

**색만 보내면 400이 난다.** 부분 업데이트가 될 것 같지만 heading 블록은
`rich_text`를 같이 보내야 받는다 (2026-08-19 실측).

```json
{"heading_3": {"color": "gray_background"}}                    → HTTP 400
{"heading_3": {"rich_text": [...], "color": "gray_background"}} → OK
```

기존 `rich_text`를 그대로 되돌려 보낼 때는 `plain_text`가 아니라 **원본 객체의
`annotations`까지 옮긴다** — 안 그러면 굵게·링크가 조용히 사라진다.

**블록 순서는 못 바꾼다.** 이동 API가 없다. 중간에 끼워 넣을 때는 append에
`after`를 준다. 이미 있는 블록을 위로 올리려면 새로 만들고 원본을 지우는 수밖에
없으므로, **페이지를 다시 짤 땐 옮기지 말고 위에 새로 쌓는 쪽이 싸다.**

```json
PATCH /v1/blocks/{page_id}/children
{"children": [...], "after": "<이 블록 바로 뒤에 넣는다>"}
```

#### 크기 제한 — 페이지가 아니라 **요청 하나**에 걸린다

페이지가 최종적으로 담는 양에는 제한이 없다. 나눠 보내면 얼마든지 쌓인다.

| 대상 | 한도 | 초과하면 |
| --- | --- | --- |
| `text.content` (rich_text 객체 하나) | **2000자** | 같은 문단 안에서 **rich_text 객체를 여럿으로 나눈다** (배열 100개까지). 문단을 쪼개지 말 것 — 화면에 없던 줄바꿈이 생긴다 |
| 배열 요소 (rich_text 등) | 100개 | |
| 한 요청의 블록 | **1000개** | 페이지를 먼저 만들고 `PATCH /v1/blocks/{page_id}/children`로 이어 붙인다 |
| 한 요청 페이로드 | **500KB** | 위와 같이 분할 |

2000자는 **서식 규칙이 아니라 직렬화 세부사항이다.** 긴 문단을 눈에 보이게
쪼갤 이유가 없다. (2026-08-16 공식 문서 확인. 이전 문구는 "넘으면 문단을
쪼갠다", "블록 100개 초과 시 분할"이었는데 둘 다 틀렸다 — 블록 한도는 1000개다.)

## Jira API

- Email: `$PLAB_WORK_EMAIL` / Server: `$PLAB_JIRA_HOST` — 둘 다 `~/.zshenv`.
  `~/.zshenv`는 비대화형 셸에도 자동 적용돼 `source` 없이 값이 보인다.
  (구 규칙 "`$JIRA_EMAIL` env var 금지, 하드코딩할 것"은 폐기 — 당시엔 그 변수가
  zshenv에 정의돼 있지 않아 빈 값이었던 것이지 전달 자체가 문제가 아니었다.)
  비었으면 하드코딩하지 말고 `printenv PLAB_WORK_EMAIL`로 먼저 확인할 것.
- **IMPORTANT:** Use `/rest/api/3/search/jql` instead of deprecated `/rest/api/3/search`
- **Priority 설정:** name 대신 **ID 사용** (name에 비표준 문자 포함 시 실패). ID 매핑: `1`=Critical, `2`=High, `3`=Medium, `4`=Low

```bash
# Correct - use search/jql endpoint
# IMPORTANT: pipe to jq to bypass RTK rewrite (RTK curl wrapper breaks -u auth)
curl -s -u "$PLAB_WORK_EMAIL:$JIRA_API_TOKEN" \
  "https://$PLAB_JIRA_HOST/rest/api/3/search/jql?jql=assignee=currentUser()+ORDER+BY+updated+DESC&maxResults=5" \
  | jq .
```

### 본문 작성 포맷 (ADF)

description·댓글 모두 ADF(Atlassian Document Format)다. 위 §Notion 페이지 작성
포맷과 같은 뜻이되, **색을 넣는 방식이 다르다.**

| 규칙 | 내용 |
| --- | --- |
| 헤딩 | **h2, h3만.** `heading` 노드 `attrs.level` |
| h2 색 | `textColor` **`#a54800`** (주황) |
| h3 색 | `textColor` **`#44546f`** (진회색) |
| 빈 문단 | **h2 앞에만** 하나 (첫 h2 제외) |
| 구분선 | `rule` 노드 **금지** |
| 취소선 | `strike` mark **금지** |

```json
{"type":"heading","attrs":{"level":2},
 "content":[{"type":"text","text":"제목",
   "marks":[{"type":"textColor","attrs":{"color":"#a54800"}}]}]}
```

**`backgroundColor` mark는 쓰지 않는다.** ADF에 존재하고 API도 받지만
다크모드에서 못 쓴다 — 2026-08-16 실측:

- Atlassian이 `@atlaskit/editor-palette`로 hex를 테마 토큰에 다시 매핑한다.
  라이트모드용 연노랑 `#fff0b3`이 **어두운 갈색으로 뒤집혔다.**
- mark는 블록이 아니라 **text 노드**에 붙는다. 헤딩이 두 줄로 접히면 배경이
  줄마다 끊겨 오른쪽 끝이 들쭉날쭉해진다. Notion 헤딩은 블록 전체가 칠해진다.

`textColor`는 `code`·`link` mark와 **같이 못 쓴다** (ADF 제약). 링크나 인라인
코드가 든 헤딩에는 색을 빼거나 그 부분만 나눈다.

색은 다크모드 기준으로 골랐다. 회색 계열은 다크모드에서 **본문보다 어둡게**
보여 헤딩이 뒤로 물러난다 — 그걸 알고 고른 값이다.

**payload를 셸에서 조립하지 말 것.** 한글과 중첩 JSON이 섞인다. python으로
파일을 만든 뒤 `--data-binary @file`로 보낸다.

## Grafana (Amazon Managed Grafana)

plabfootball 관측 대시보드. **Datadog에서 이관 중** — 신규 지표는 이쪽을 먼저 본다.

자격증명은 `~/.zshenv`의 `PLAB_GRAFANA_*`. 저장소에 절대 쓰지 않는다.
`PLAB_GRAFANA_URL` `PLAB_GRAFANA_WORKSPACE_ID` `PLAB_GRAFANA_SA_ID` `PLAB_GRAFANA_TOKEN`

**토큰은 `~/.zshenv` 인라인이 아니라 `~/.config/plab/grafana-token`(0600)에 있다.**
AMG 토큰은 `secondsToLive` 상한이 30일이라 매달 재발급되는데, 갱신 스크립트가
`~/.zshenv`를 자동 편집하게 두면 DB 자격증명과 같은 파일을 매달 sed로 건드리게 된다.
`~/.zshenv`는 그 파일을 읽어 `PLAB_GRAFANA_TOKEN`으로 export만 한다.

| 항목 | 값 |
| --- | --- |
| 인증 (브라우저) | SAML — Google Workspace. 사람이 볼 때만 |
| 인증 (헤드리스) | 서비스 계정 토큰 `Authorization: Bearer $PLAB_GRAFANA_TOKEN` |
| 서비스 계정 | `claude-code-jw` (id 128, Admin) |
| 토큰 만료 | 30일. `~/plab/jobs`의 `grafana-token-rotate` 잡이 매일 07:23 확인, 7일 이내면 재발급 |
| 데이터소스 | Amazon Managed Prometheus · CloudWatch · X-Ray |

```bash
# 대시보드 목록 (jq 파이프 필수 — RTK가 JSON을 { key: type }로 뭉갠다)
curl -s -H "Authorization: Bearer $PLAB_GRAFANA_TOKEN" \
  "$PLAB_GRAFANA_URL/api/search?limit=200" | jq -r '.[]|"\(.type) \(.title) \(.uid)"'

# 대시보드 1개의 패널 쿼리 전문 — 지표를 새로 짜기 전에 이걸 먼저 읽는다
curl -s -H "Authorization: Bearer $PLAB_GRAFANA_TOKEN" \
  "$PLAB_GRAFANA_URL/api/dashboards/uid/prod-api-latency" | jq '.dashboard.panels'

# 데이터소스 uid 조회 (아래 ds/query에 필요)
curl -s -H "Authorization: Bearer $PLAB_GRAFANA_TOKEN" \
  "$PLAB_GRAFANA_URL/api/datasources" | jq -c '[.[]|{name,type,uid}]'
```

**PromQL 직접 실행** — 스크린샷을 읽지 말고 값을 가져온다.

```bash
NOW=$(python3 -c 'import time;print(int(time.time()*1000))'); FROM=$((NOW-3600000))
curl -s -X POST "$PLAB_GRAFANA_URL/api/ds/query" \
  -H "Authorization: Bearer $PLAB_GRAFANA_TOKEN" -H "Content-Type: application/json" \
  -d "{\"from\":\"$FROM\",\"to\":\"$NOW\",\"queries\":[{\"refId\":\"A\",
       \"datasource\":{\"type\":\"prometheus\",\"uid\":\"<uid>\"},
       \"expr\":\"<promql>\",\"instant\":true,\"intervalMs\":60000,\"maxDataPoints\":1}]}" \
  | jq '.results.A.frames[0].data.values'
```

BE 2.0 지표는 `service_name="social-backend-prod"` 라벨을 쓴다
(`http_server_request_duration_seconds_{bucket,count,sum}`).

**AWS CLI로는 대시보드·메트릭을 못 읽는다.** `aws grafana`는 컨트롤 플레인
(`describe-workspace`, 서비스 계정 관리)뿐이다. 데이터는 위 HTTP API로만 나온다.

**서비스 계정 관리는 `aws grafana` CLI로 한다** (2026-08-07 CLI 2.36.18로 업그레이드 후 가능).

```bash
AWS_PROFILE=plab aws grafana list-workspace-service-accounts \
  --workspace-id "$PLAB_GRAFANA_WORKSPACE_ID" --region ap-northeast-2
AWS_PROFILE=plab aws grafana list-workspace-service-account-tokens \
  --workspace-id "$PLAB_GRAFANA_WORKSPACE_ID" --service-account-id "$PLAB_GRAFANA_SA_ID" \
  --region ap-northeast-2
```

이 계열은 AMG가 Grafana 10.4를 지원하며 추가됐다(2024-05). 버전을 외우지 말고 확인할 것 —
`aws grafana help | grep -c service-account`가 0이면 CLI가 오래된 것.

**갱신 잡은 여전히 boto3를 쓴다.** launchd에서 `aws`가 PATH에 있으리라 가정하지 않고,
날짜 연산(`expiresAt`의 `+09:00` 오프셋)이 jq·macOS `date` 양쪽에서 지저분하기 때문이다.
인터프리터는 `~/.pyenv/versions/jobs-tools/bin/python` (python 3.13.2 + boto3).

⚠️ **launchd(`zsh -lc`)의 `python3`는 `/usr/bin/python3`(3.9.6)다.** `.zshrc`를 안 읽어
pyenv가 초기화되지 않기 때문 — 예약 실행에서만 시스템 python으로 떨어진다(2026-08-07 실측).
PyYAML은 시스템 python에 들어 있어 `bin/jobs`는 우연히 돌지만, boto3 같은 건 없다.

**스케줄 스크립트는 인터프리터를 절대경로로 고정할 것.** shim(`~/.pyenv/shims/python3`)도
쓰지 말 것 — `pyenv global`을 따라가므로 대화형 셸에서 버전을 한 번 바꾸면 무인 잡이
죽는다 (2026-08-07 global 3.9.10 → 3.13.2 전환에 실제로 깨졌다). 전용 virtualenv를 쓴다.

## AWS Credentials

**프로파일 전환 규칙 (모든 AWS CLI/SDK 사용 전 필수):**

| 디렉토리               | AWS Profile | 용도               |
| ---------------------- | ----------- | ------------------ |
| `~/work/*`, `~/plab/*` | `plab`      | $PLAB_GH_ORG 업무 |
| 그 외                  | `default`   | 기본값             |

```bash
# ~/work/ 또는 ~/plab/ 에서
AWS_PROFILE=plab aws ...

# 그 외
aws ...  # default profile 사용
```
