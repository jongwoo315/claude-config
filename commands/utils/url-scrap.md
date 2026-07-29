---
name: url-scrap
description: URL 하나를 받아 요약하고, 승인 시 Notion Dev Scraps DB에 새 페이지로 저장. jira/notion/slack URL은 대상 아님 (그건 parse:* 커맨드 담당).
---

# URL → Dev Scraps

## Overview

아티클 URL을 받아 한국어로 요약하고, 사용자 승인이 있을 때만 Notion Dev Scraps DB에
**새 페이지를 생성**한다. 승인 없으면 요약만 보여주고 세션을 계속한다.

기존 `knowledge:dev-scraps-tldr`과 구분: 그건 **이미 있는 페이지**를 요약으로 교체하고,
이건 **URL에서 새 페이지를 만든다.**

**Database:** Dev Scraps — `76e9673e-d91b-41b2-9779-c0940040f542`
**API Key:** `NOTION_API_KEY` (`~/prv` 컨텍스트)

## 발동 조건

세 조건을 **모두** 만족할 때만 자동 발동한다:

1. 프롬프트에 **URL만** 있다 (다른 지시문이 붙어 있으면 발동 안 함 — 그건 일반 요청)
2. 실행 디렉토리가 `~/prv` 계열
3. URL이 **jira / notion / slack 이 아니다**

| URL 종류 | 처리 |
| --- | --- |
| `*.atlassian.net`, jira | `parse:jira` |
| `notion.so`, `app.notion.com` | `parse:notion` |
| `*.slack.com` | `parse:slack` |
| 그 외 (블로그, 문서, GitHub, 유튜브 등) | **이 커맨드** |

수동 호출도 가능: `/utils:url-scrap <url>`

## Process

### Step 1: 본문 가져오기 (폴백 사다리)

**1a. WebFetch 시도.**

**1b. 본문 충분한지 검사 — 이 단계를 건너뛰지 말 것.**

WebFetch는 HTTP GET 한 번으로 받은 HTML만 마크다운으로 바꾼다. JS를 실행하지 않으므로
**SPA는 성공(200)해도 본문이 비어 있다.** 껍데기(네비게이션, 푸터, og 메타태그)만 오고
본문은 안 온다. "실패"가 아니라 "성공했는데 알맹이가 없는" 상태라 그냥 두면 껍데기로
요약을 지어내게 된다.

불충분 신호:

- 본문 텍스트가 500자 미만
- 네비게이션·메뉴 링크 목록만 있고 문단이 없음
- 제목/타이틀 문구만 있고 그걸 뒷받침하는 내용이 없음
- 요약을 쓰려는데 "이건 추측인데"라는 생각이 든다 → 불충분이다

**1c. 불충분하면 헤드리스 Chrome으로 재시도.**

```bash
~/.claude/command-scripts/utils/url-scrap/fetch-rendered.sh "<URL>"
# 느린 페이지: BUDGET=20000 ~/.claude/.../fetch-rendered.sh "<URL>"
```

로컬 Chrome을 `--headless=new --dump-dom`으로 돌려 **JS 실행 후의 DOM**을 받고 텍스트만
뽑아 stdout으로 낸다. stderr에 `[extracted N chars]`가 찍히니 그 값으로 충분성을 다시 판단한다.

`claude-in-chrome` 확장은 쓰지 않는다. 확장은 사이트 허용목록에 없는 도메인을
`This site is not allowed due to safety restrictions`로 막아버려서, 사용자가 수동으로
권한을 열어주기 전엔 진행이 불가능하다. 헤드리스 Chrome은 그 제약이 없다.

출력이 크면 파일로 받아서 Read로 읽는다 (긴 stdout은 UI에서 접힘):

```bash
fetch-rendered.sh "<URL>" > "$SCRATCHPAD/page.txt"
```

**1d. 그래도 본문이 없으면 중단하고 선택지를 제시.**

로그인·페이월이 걸려 있거나 Chrome이 없는 경우다. 사용자에게 알리고 2가지를 제시한다:

1. 본문을 직접 붙여넣기
2. 건너뛰기

**어느 단계에서든 내용을 추측해 채우지 않는다.** 제목·태그라인만 가지고 요약하는 것도
지어내는 것이다.

### Step 2: 요약 생성

한국어. 내용 성격에 맞춰 섹션 구조를 정한다 (고정 템플릿 아님).

| 내용 유형 | 섹션 예시 |
| --- | --- |
| 개념/이론 | 핵심 요약 → 주요 포인트 → 실무 적용 |
| 에러/트러블슈팅 | 핵심 요약 → 원인 → 해결법 |
| 코드/라이브러리 | 핵심 요약 → 주요 포인트 → 핵심 코드 |
| 도구/설정 | 핵심 요약 → 설정 방법 → 주의사항 |

**서식 규칙 (엄수):**

- **h2, h3만 사용.** h1 금지, h4 이하 금지
- h2 → `"color": "yellow_background"`
- h3 → `"color": "gray_background"`
- **h2 섹션 사이에는 빈 문단 하나** (`"rich_text": []`)
- **h3 사이에는 빈 문단 없음**
- **취소선 사용 금지** (`strikethrough` 절대 쓰지 않음)
- 원문에 코드가 있으면 code block으로 최대한 살린다
- rich_text는 2000자 제한 — 넘으면 문단을 쪼갠다

### Step 3: 미리보기 + 확인

요약을 마크다운으로 터미널에 직접 출력한 뒤 AskUserQuestion:

- **저장** → Step 4
- **저장 안 함** → 요약만 남기고 종료. 세션은 그대로 이어간다 (중단하지 않음)
- **수정 요청** → 피드백 받아 Step 2 재생성

### Step 4: Notion 페이지 생성

**4a. 주제 옵션 확인 (필수 — 신규 생성 금지):**

`주제`는 select라 임의 값을 넣으면 새 옵션이 생긴다. 반드시 기존 옵션에서 고른다.
목록은 하드코딩하지 말고 실행 시점에 조회한다:

```bash
source ~/.zshenv
notion_key=$(printenv NOTION_API_KEY)
DB_ID="76e9673e-d91b-41b2-9779-c0940040f542"

curl -s "https://api.notion.com/v1/databases/$DB_ID" \
  -H "Authorization: Bearer $notion_key" \
  -H "Notion-Version: 2022-06-28" \
  | jq '.properties["주제"].select.options | map(.name)'
```

가장 연관성 높은 하나를 고른다. 마땅한 게 없으면 **`Etc`**. 새 값을 만들지 않는다.

**4b. 컬럼 매핑:**

| 컬럼 | 타입 | 값 |
| --- | --- | --- |
| `제목` | title | 원문 제목 (한국어 번역 아님, 원문 그대로) |
| `주제` | select | 기존 옵션 중 최적 1개. 없으면 `Etc` |
| `카테고리` | select | **비움** (프로퍼티 자체를 넣지 않음) |
| `관련` | multi_select | `["Claude"]` |
| `본문 길이` | select | 요약 분량 판단 → `상` / `중` / `하` |
| `완료` | checkbox | `true` |
| `작성일` | date | 오늘 (`date +%Y-%m-%d`) |
| `URL` | url | 입력받은 URL |

`상위카테고리`, `하위카테고리`는 건드리지 않는다.

**본문 길이 기준:** `하` = 요약이 짧고 단일 개념 / `중` = 섹션 2~3개 / `상` = 섹션 4개 이상
또는 코드 블록이 여럿.

**4c. 페이지 생성:**

```bash
curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d @- <<'JSON' | jq '{id, url}'
{
  "parent": { "database_id": "76e9673e-d91b-41b2-9779-c0940040f542" },
  "properties": {
    "제목":      { "title": [{ "text": { "content": "<원문 제목>" } }] },
    "주제":      { "select": { "name": "<기존 옵션>" } },
    "관련":      { "multi_select": [{ "name": "Claude" }] },
    "본문 길이": { "select": { "name": "<상|중|하>" } },
    "완료":      { "checkbox": true },
    "작성일":    { "date": { "start": "<YYYY-MM-DD>" } },
    "URL":       { "url": "<입력 URL>" }
  },
  "children": [ <블록들> ]
}
JSON
```

`children`을 함께 보내면 페이지 생성과 본문 작성이 한 번에 끝난다. 블록이 100개를 넘으면
먼저 페이지만 만들고 나머지는 `PATCH /v1/blocks/{page_id}/children`으로 이어 붙인다.

**블록 구조:**

```json
[
  { "object": "block", "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "핵심 요약" } }],
      "color": "yellow_background" } },
  { "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [{ "text": { "content": "<내용>" } }] } },

  { "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [] } },

  { "object": "block", "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "주요 포인트" } }],
      "color": "yellow_background" } },
  { "object": "block", "type": "heading_3",
    "heading_3": {
      "rich_text": [{ "text": { "content": "<소제목>" } }],
      "color": "gray_background" } },
  { "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [{ "text": { "content": "<설명>" } }] } },
  { "object": "block", "type": "heading_3",
    "heading_3": {
      "rich_text": [{ "text": { "content": "<다음 소제목>" } }],
      "color": "gray_background" } }
]
```

빈 문단은 **h2 앞에만** 넣는다 (첫 h2 제외). h3 앞에는 넣지 않는다.

### Step 5: 결과 보고

생성된 페이지 URL을 출력한다. 저장 안 함을 골랐으면 그 사실만 알리고 세션을 이어간다.

## Error Handling

| 상황 | 조치 |
| --- | --- |
| `NOTION_API_KEY` 없음 | `~/.zshenv` 설정 안내 후 중단 |
| WebFetch 실패 (네트워크/4xx) | 헤드리스 Chrome 폴백 (Step 1c) |
| WebFetch 성공했는데 본문 빈약 (CSR) | 헤드리스 Chrome 폴백 (Step 1c). 껍데기로 요약 금지 |
| `fetch-rendered.sh` exit 1 (빈 DOM) | 중단. 붙여넣기 / 건너뛰기 제시 |
| Chrome 미설치 | 중단. 붙여넣기 / 건너뛰기 제시 |
| 주제에 마땅한 옵션 없음 | `Etc` 사용. 새 옵션 생성 금지 |
| Notion API 4xx | 응답 body를 그대로 보여주고 재시도 여부 확인 |
| rich_text 2000자 초과 | 문단 분할 |
| 블록 100개 초과 | 페이지 생성 후 나머지 append |

## Notes

- `카테고리`를 비우는 건 의도적이다. `knowledge:dev-scraps-tldr`이 나중에 채운다.
- `완료`를 바로 `true`로 두는 건 이 커맨드가 요약까지 끝내기 때문이다 — 후처리 대상이 아니다.
