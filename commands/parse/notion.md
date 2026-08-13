---
name: parse-notion
description: Use when starting a task from a Notion page URL - extracts page properties, content, comments, images, toggles, and subpages for downstream processing
---

# Parse Notion Page

## Overview

Notion URL에서 페이지의 모든 콘텐츠를 추출하여 `docs/plans/`에 저장합니다.

**추출 대상:**
- 페이지 속성 (Properties)
- 모든 블록 콘텐츠 (텍스트, 코드, 테이블 등)
- 토글/접힌 콘텐츠
- 이미지
- 댓글
- 하위 페이지 (Subpages)
- Slack URL (발견 시 자동 추출)

## When to Use

- Notion 페이지 URL을 받아서 작업을 시작할 때
- 기획 문서/PRD가 Notion에 있을 때
- Notion 페이지의 전체 컨텍스트가 필요할 때

## Environment

**API Key 선택 규칙:**

| URL 패턴 | API Key | Source |
|----------|---------|--------|
| `notion.so/plabfootball/*` | `PLAB_WOZ_NOTION_API_KEY` | `~/.zshenv` |
| 기타 | `NOTION_API_KEY` | `~/.zshenv` |

**중요:** `.env` 파일의 키는 무시하고 반드시 `~/.zshenv`에서 직접 읽어야 함 (환경변수가 outdated될 수 있음)

```bash
# ~/.zshenv에서 직접 키 추출 (현재 env 무시)
PLAB_KEY=$(grep -E '^export PLAB_WOZ_NOTION_API_KEY=' ~/.zshenv | cut -d'=' -f2)
NOTION_KEY=$(grep -E '^export NOTION_API_KEY=' ~/.zshenv | cut -d'=' -f2)
```

## Process

### 1. URL에서 Page ID 추출 및 워크스페이스 감지

Notion URL 형식:
- `https://www.notion.so/{workspace}/{title}-{page_id}`
- `https://www.notion.so/{page_id}`
- `https://www.notion.so/{workspace}/{page_id}?v=...`

```bash
NOTION_URL="$1"

# Query string 제거 후 Page ID 추출 (v= 파라미터의 ID와 혼동 방지)
URL_PATH=$(echo "$NOTION_URL" | cut -d'?' -f1)
PAGE_ID=$(echo "$URL_PATH" | grep -oE '[a-f0-9]{32}' | tail -1)

# UUID 형식으로 변환 (8-4-4-4-12)
PAGE_UUID="${PAGE_ID:0:8}-${PAGE_ID:8:4}-${PAGE_ID:12:4}-${PAGE_ID:16:4}-${PAGE_ID:20:12}"

# 워크스페이스 감지 (plabfootball 여부)
IS_PLAB=$(echo "$NOTION_URL" | grep -q "notion.so/plabfootball" && echo "true" || echo "false")
```

### 2. API 호출 (병렬 실행)

**병렬로 실행할 수 있는 요청들:**

```bash
# ~/.zshenv에서 직접 키 추출 (현재 env 무시 - outdated 방지)
PLAB_KEY=$(grep -E '^export PLAB_WOZ_NOTION_API_KEY=' ~/.zshenv | cut -d'=' -f2)
NOTION_KEY=$(grep -E '^export NOTION_API_KEY=' ~/.zshenv | cut -d'=' -f2)

# 워크스페이스에 따라 API 키 선택
if [ "$IS_PLAB" = "true" ]; then
  API_KEY="$PLAB_KEY"
  echo "Using PLAB_WOZ_NOTION_API_KEY for plabfootball workspace"
else
  API_KEY="$NOTION_KEY"
  echo "Using NOTION_API_KEY for personal workspace"
fi

# 1) 페이지 속성 조회
curl -s -X GET "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Notion-Version: 2022-06-28" > page_properties.json &

# 2) 페이지 블록(콘텐츠) 조회
curl -s -X GET "https://api.notion.com/v1/blocks/$PAGE_UUID/children?page_size=100" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Notion-Version: 2022-06-28" > page_blocks.json &

# 3) 댓글 조회
curl -s -X GET "https://api.notion.com/v1/comments?block_id=$PAGE_UUID" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Notion-Version: 2022-06-28" > page_comments.json &

wait
```

### 3. 재귀적 블록 탐색

**토글, 하위 페이지 등 중첩 콘텐츠 처리:**

```bash
# has_children: true인 블록은 재귀 조회 필요
fetch_children() {
  local block_id="$1"
  curl -s -X GET "https://api.notion.com/v1/blocks/$block_id/children?page_size=100" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Notion-Version: 2022-06-28"
}

# 병렬로 하위 블록 조회 (토글, callout, column 등)
for block_id in $(jq -r '.results[] | select(.has_children == true) | .id' page_blocks.json); do
  fetch_children "$block_id" > "block_${block_id}.json" &
done
wait
```

### 4. 블록 타입별 처리

| 블록 타입 | 처리 방법 |
|-----------|-----------|
| `paragraph`, `heading_*` | `rich_text` 추출 |
| `toggle` | `rich_text` + `children` 재귀 탐색 |
| `image` | `external.url` 또는 `file.url` 추출 |
| `child_page` | 하위 페이지 ID 저장, 필요 시 재귀 파싱 |
| `code` | `language` + `rich_text` 추출 |
| `callout` | `icon` + `rich_text` + `children` |
| `table` | `table_row` children 파싱 |
| `bookmark`, `embed` | URL 추출 |

### 5. Slack URL 자동 감지

```bash
# 모든 텍스트에서 Slack URL 추출
grep -oE 'https://[a-zA-Z0-9-]+\.slack\.com/archives/[^ ]+' combined_content.txt > slack_urls.txt

# Slack URL 발견 시 알림
if [ -s slack_urls.txt ]; then
  echo "Slack URLs found - consider running parse-slack for additional context"
fi
```

### 6. 결과 저장

결과를 `docs/plans/YYMMDD-<topic>-notion-input.md`에 저장:

```markdown
# Notion Input - {페이지 제목}

**Source:** {original_url}
**Parsed:** {timestamp}

## Properties

| Property | Value |
|----------|-------|
| Status | {status} |
| Assignee | {assignee} |
| Due Date | {date} |
| ... | ... |

## Content

{parsed_content_with_headers_and_formatting}

### Toggle: {toggle_title}
> {toggle_content}

### Images
![{caption}]({image_url})

### Code Blocks
```{language}
{code}
```

## Subpages

- [{subpage_title}]({subpage_url}) - {id}

## Comments

1. **{author}** ({timestamp}):
   > {comment_text}

## Slack URLs Found

- {slack_url_1}
- {slack_url_2}

## Metadata

- **Page ID:** {page_id}
- **Created:** {created_time}
- **Last Edited:** {last_edited_time}
- **Created By:** {created_by}
```

## Output

- 파일 경로: `docs/plans/YYMMDD-<topic>-notion-input.md`
- `<topic>`은 페이지 제목에서 추출하거나 사용자에게 확인

## Parallel Execution Strategy

```
┌─────────────────────────────────────────────────────┐
│                    Start                            │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              Extract Page ID from URL               │
└─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ Page    │    │ Blocks  │    │Comments │
   │Properties│   │(Level 1)│    │         │
   └─────────┘    └─────────┘    └─────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│     Parallel: Fetch children of nested blocks       │
│     (toggles, callouts, columns, child_pages)       │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              Merge & Format Output                  │
└─────────────────────────────────────────────────────┘
```

## Error Handling

```bash
# API 응답 검증
if jq -e '.object == "error"' page_properties.json > /dev/null 2>&1; then
  ERROR_MSG=$(jq -r '.message' page_properties.json)
  ERROR_CODE=$(jq -r '.code' page_properties.json)
  echo "Error: $ERROR_MSG"

  if [ "$ERROR_CODE" = "unauthorized" ]; then
    echo "API Key 문제:"
    echo "  - ~/.zshenv의 키가 올바른지 확인"
    echo "  - plabfootball URL → PLAB_WOZ_NOTION_API_KEY 필요"
    echo "  - 개인 URL → NOTION_API_KEY 필요"
  else
    echo "Possible causes:"
    echo "  - Page not shared with integration"
    echo "  - Invalid page ID"
  fi
  exit 1
fi
```

## Integration Setup

Notion API를 사용하려면 Integration이 페이지에 연결되어 있어야 합니다:

1. [Notion Integrations](https://www.notion.so/my-integrations)에서 Integration 생성
2. 대상 페이지에서 `...` → `Connections` → Integration 연결
3. `~/.zshenv`에 환경변수 설정:
   - **plabfootball 워크스페이스**: `export PLAB_WOZ_NOTION_API_KEY=ntn_xxx`
   - **개인 워크스페이스**: `export NOTION_API_KEY=ntn_xxx`

**주의:** 현재 세션의 환경변수가 아닌 `~/.zshenv` 파일에서 직접 읽음 (키 갱신 시 즉시 반영)

## Next Step

파싱 완료 후 사용자에게 확인:
> "Notion 페이지를 파싱했습니다. 내용을 확인해주세요."

Slack URL이 발견된 경우:
> "Slack URL이 발견되었습니다. 해당 스레드도 파싱할까요?"

<!-- SYNC: parse/jira.md, parse/slack.md, parse/notion.md -->
그 후 워크플로우를 선택합니다:
> "어떤 워크플로우로 진행할까요?"
> 1. **dev-workflow** — 프로세스 중심 (계획 → 추적 → 실행 → 검증)
> 2. **debugging-workflow** — 버그/이슈 근본 원인 분석 후 수정 (systematic-debugging 포함)
> 3. **ralph-dev** — 자율 반복 (well-defined tasks, clear success criteria)
> 4. **직접 진행** — 워크플로우 없이 직접 작업
