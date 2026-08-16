---
name: dev-scraps-tldr
description: Use when processing Dev Scraps Notion pages to generate TL;DR summaries - batch processing incomplete pages, summarizing articles from URLs or existing content, replacing original content with structured Korean summaries
---

# Dev Scraps TL;DR

## Overview

Dev Scraps DB의 미완료 페이지를 읽고, 적응형 TL;DR을 생성하여 원본을 대체하고 완료 처리하는 스킬.
항상 한국어로 작성. 간결하게 (~100-150 단어).

**Database:** Dev Scraps
**Database ID:** `76e9673e-d91b-41b2-9779-c0940040f542`
**API Key:** `NOTION_API_KEY`

> **NOTE:** 2025-01-18 이전 페이지들은 이 스킬의 대상이 아님. 수동으로 처리하거나 별도로 관리할 것.

## Invocation

- `/dev-scraps-tldr` — interactive batch, oldest 작성일 first
- `/dev-scraps-tldr <notion-page-url>` — specific page
- `/dev-scraps-tldr batch N` — process N pages without confirmation

## Process

### Step 1: Determine Mode

Parse invocation argument:
- No arg → **interactive batch** mode
- Notion URL → **single page** mode (extract page ID from URL)
- `batch N` → **batch** mode (N pages, no confirmation)

### Step 2: Query Pages

```bash
source ~/.zshenv
notion_key=$(printenv NOTION_API_KEY)
DB_ID="76e9673e-d91b-41b2-9779-c0940040f542"

curl -s -X POST "https://api.notion.com/v1/databases/$DB_ID/query" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "filter": {
      "and": [
        { "property": "완료", "checkbox": { "equals": false } },
        { "property": "작성일", "date": { "on_or_after": "2025-01-18" } },
        { "property": "카테고리", "select": { "does_not_equal": "📖 Materials" } }
      ]
    },
    "sorts": [{ "property": "작성일", "direction": "ascending" }],
    "page_size": 10
  }'
```

For single page mode, skip this and fetch the page directly via `GET /v1/pages/{page_id}`.

**IMPORTANT:** 반드시 터미널에 페이지 정보를 텍스트로 출력할 것 (tool call이 아닌 직접 텍스트 출력):
```
Processing: {제목} ({작성일})
URL: {URL 또는 "없음"}
```

### Step 3: Read Content & Quality Check

**3a. Read existing page blocks:**

```bash
PAGE_ID="<page_id>"
curl -s "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $notion_key" \
  -H "Notion-Version: 2022-06-28"
```

Paginate with `next_cursor` if `has_more=true`. Concatenate all text from blocks.

**3b. Quality check — is content sufficient for TL;DR?**

- **Heuristic:** < 200 characters total text OR < 3 blocks → insufficient
- **Semantic:** Claude judges if content looks truncated/partial (e.g. only intro captured)
- If sufficient → proceed to Step 4
- If insufficient → try fetching URL (Step 3c)

**3c. Fetch URL (fallback):**

Get URL property from page properties. Use WebFetch to retrieve content.

- URL fetch succeeds → use fetched content (supplement with existing page content)
- URL fetch fails → use whatever existing content we have
- No URL + no content → **skip this page**, report to user

### Step 4: Generate Adaptive TL;DR

Claude reads the content and chooses the best section structure based on content type.

**Section examples (not rigid — Claude adapts):**

| Content Type | Sections |
|---|---|
| Concept/Theory | 핵심 요약 → 주요 포인트 → 실무 적용 |
| Error/Troubleshooting | 핵심 요약 → 원인 → 해결법 |
| Code tutorial/library | 핵심 요약 → 주요 포인트 → 핵심 코드 |
| Opinion/Best practices | 핵심 요약 → 주요 포인트 |
| Tool/Setup guide | 핵심 요약 → 설정 방법 → 주의사항 |

**Constraints:**
- Always Korean
- 간결하되 핵심을 빠뜨리지 않을 것. 코드 스니펫은 가능한 유지.
- **서식은 `rules/apis.md` §페이지 작성 포맷을 따른다** — h2 `yellow_background`,
  h3 `gray_background`, h2 앞 빈 문단, 구분선·취소선 금지, rich_text 2000자.
  여기 복제하지 않는다 (사본은 한쪽만 고쳐지며 갈라진다).
- **참고링크:** 페이지 내 참조 URL이 **여러 개** 있을 때만 `참고링크` heading2 섹션을 추가하고 하위에 bookmark 또는 bulleted_list_item으로 URL 나열. URL이 1개뿐이면 URL property에만 유지하고 참고링크 섹션은 생략.

### Step 5: Preview & Confirm

Show page info and TL;DR as markdown in terminal:
```
--- {제목} ({작성일}) ---
URL: {URL 또는 "없음"}

[TL;DR 미리보기]
```

**Interactive batch mode — AskUserQuestion:**
- 저장 → proceed to Step 6
- 건너뛰기 → skip this page, move to next
- 수정 요청 → user gives feedback, regenerate Step 4
- 중단 → stop processing entirely

**Batch mode:** skip confirmation, auto-save.

**Single page mode:** show preview, confirm once.

### Step 6: Write to Notion

**6a. Delete all existing blocks:**

```bash
# Get all block IDs
curl -s "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $notion_key" \
  -H "Notion-Version: 2022-06-28"

# Delete each block
curl -s -X DELETE "https://api.notion.com/v1/blocks/<BLOCK_ID>" \
  -H "Authorization: Bearer $notion_key" \
  -H "Notion-Version: 2022-06-28"
```

Paginate and delete ALL blocks. Delete sequentially to avoid race conditions.

**6b. Append TL;DR blocks:**

```bash
curl -s -X PATCH "https://api.notion.com/v1/blocks/$PAGE_ID/children" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{ "children": [ <BLOCKS> ] }'
```

**Block structure pattern:**

TL;DR 블록 맨 끝에 원본 출처 정보를 추가한다.

```json
[
  {
    "object": "block", "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "핵심 요약" } }],
      "color": "yellow_background"
    }
  },
  {
    "object": "block", "type": "paragraph",
    "paragraph": {
      "rich_text": [{ "text": { "content": "<요약 내용>" } }]
    }
  },
  {
    "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [] }
  },
  {
    "object": "block", "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "주요 포인트" } }],
      "color": "yellow_background"
    }
  },
  {
    "object": "block", "type": "heading_3",
    "heading_3": {
      "rich_text": [{ "text": { "content": "<포인트 제목>" } }],
      "color": "gray_background"
    }
  },
  {
    "object": "block", "type": "paragraph",
    "paragraph": {
      "rich_text": [{ "text": { "content": "<포인트 설명>" } }]
    }
  },
  "... (adaptive sections) ..."
]
```

**참고링크 섹션 (여러 URL이 있을 때만):**
페이지 내 bookmark, inline link 등 참조 URL이 2개 이상일 때만 마지막에 추가:
```json
  {
    "object": "block", "type": "paragraph",
    "paragraph": { "rich_text": [] }
  },
  {
    "object": "block", "type": "heading_2",
    "heading_2": {
      "rich_text": [{ "text": { "content": "참고링크" } }],
      "color": "yellow_background"
    }
  },
  {
    "object": "block", "type": "bookmark",
    "bookmark": { "url": "<URL1>" }
  },
  {
    "object": "block", "type": "bookmark",
    "bookmark": { "url": "<URL2>" }
  }
```
URL이 1개뿐이면 참고링크 섹션 생략 (URL property에만 유지).

**Rules:** `rules/apis.md` §페이지 작성 포맷 참조. 위 JSON 예시가 그 규칙을
적용한 형태다.

**6c. Mark 완료:**

```bash
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{ "properties": { "완료": { "checkbox": true } } }'
```

### Step 7: Next Page (Interactive Batch Only)

After saving, AskUserQuestion: "다음 페이지로 진행할까요?"
- 예 → go to next page (Step 3)
- 아니오 → stop and show summary

### Step 8: End Summary

```
처리 완료: X개 저장, Y개 건너뜀, Z개 실패
```

## Error Handling

| Situation | Action |
|---|---|
| NOTION_API_KEY 없음 | `~/.zshenv`에서 설정 안내 |
| URL fetch fails | Use existing content, warn user |
| No content + no URL | Skip, report |
| No content + URL fetch fails | Skip, report |
| Notion API error | Show error, ask "retry or skip?" |
| rich_text > 2000 chars | Split the rich_text array, not the paragraph — see `rules/apis.md` §크기 제한 |
