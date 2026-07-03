---
name: personal-update-task
description: Updates an existing personal Notion task page - properties and/or block content
---

# Update Personal Notion Task

## Overview

기존 Notion 태스크 페이지의 프로퍼티를 업데이트하고, 선택적으로 블록 콘텐츠를 추가합니다.

## Prerequisites

- `NOTION_API_KEY` 환경변수 설정 (`~/.zshenv`)
- 기존 Notion 태스크 페이지 (URL 또는 Page ID)

## API Key 추출

**주의:** `source ~/.zshenv`는 zle hook 경고가 대량 출력되므로 사용하지 않음.

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
```

## Property Update Reference

Notion API `PATCH /v1/pages/{page_id}` 사용. 업데이트할 프로퍼티만 포함하면 됨.

| 프로퍼티 | 타입 | 업데이트 JSON 형식 |
|----------|------|-------------------|
| 태스크 | title | `"태스크": {"title": [{"text": {"content": "새 제목"}}]}` |
| 상태 | select | `"상태": {"select": {"name": "진행 중"}}` (옵션: 시작 전/진행 중/완료) |
| 프로젝트 | select | `"프로젝트": {"select": {"name": "프로젝트명"}}` |
| 생성일 | date | `"생성일": {"date": {"start": "YYYY-MM-DD"}}` (범위: `{"start": "...", "end": "..."}`) |
| Git 브랜치 | url | `"Git 브랜치": {"url": "https://github.com/.../tree/branch"}` |
| Git 저장소 | url | `"Git 저장소": {"url": "https://github.com/..."}` |
| PR | url | `"PR": {"url": "https://github.com/.../pull/N"}` |
| 선행 작업 | relation | `"선행 작업": {"relation": [{"id": "page-uuid"}]}` |
| 후속 작업 | relation | `"후속 작업": {"relation": [{"id": "page-uuid"}]}` |
| ID | unique_id | 읽기 전용 (업데이트 불가) |

**URL 프로퍼티 초기화:** `"Git 브랜치": {"url": null}`

## Process

### 1. Page ID 추출

Notion URL에서 Page ID 추출:
```bash
NOTION_URL="<URL>"
PAGE_ID=$(echo "$NOTION_URL" | grep -oE '[a-f0-9]{32}' | tail -1)
PAGE_UUID="${PAGE_ID:0:8}-${PAGE_ID:8:4}-${PAGE_ID:12:4}-${PAGE_ID:16:4}-${PAGE_ID:20:12}"
```

### 2. 기존 페이지 정보 조회

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)

curl -s -X GET "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" | jq '{
    id: .id,
    url: .url,
    dev_id: .properties.ID.unique_id.number,
    task: .properties.태스크.title[0].plain_text,
    status: .properties.상태.select.name,
    project: .properties.프로젝트.select.name,
    date: .properties.생성일.date,
    git_branch: .properties."Git 브랜치".url,
    git_repo: .properties."Git 저장소".url,
    pr: .properties.PR.url
  }'
```

### 3. 프로퍼티 업데이트

업데이트할 프로퍼티만 포함하여 PATCH 요청:

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "<PROPERTY_NAME>": <PROPERTY_VALUE>
    }
  }'
```

**예시 - 상태를 "진행 중"으로 변경:**
```bash
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "진행 중" } }
    }
  }'
```

**예시 - 여러 프로퍼티 동시 업데이트:**
```bash
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "진행 중" } },
      "Git 브랜치": { "url": "https://github.com/owner/repo/tree/feature/DEV-42-desc" },
      "Git 저장소": { "url": "https://github.com/owner/repo" }
    }
  }'
```

### 4. 블록 콘텐츠 추가 (선택)

Brainstorming 요약 등 페이지 본문에 콘텐츠를 추가할 때 사용:

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)

curl -s -X PATCH "https://api.notion.com/v1/blocks/$PAGE_UUID/children" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "children": [
      {
        "object": "block",
        "type": "divider",
        "divider": {}
      },
      {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{ "text": { "content": "Brainstorming Summary" } }]
        }
      },
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{ "text": { "content": "<SUMMARY>" } }]
        }
      },
      {
        "object": "block",
        "type": "heading_3",
        "heading_3": {
          "rich_text": [{ "text": { "content": "Design Document" } }]
        }
      },
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{ "text": { "content": "<repo-root>/docs/plans/YYMMDD-<topic>-design.md" } }]
        }
      }
    ]
  }'
```

**`<repo-root>`** = `$(git rev-parse --show-toplevel)` 실행 결과 (절대 경로).

### 5. 결과 출력

```
Notion 페이지가 업데이트되었습니다:
- ID: DEV-{number}
- URL: {page_url}
- 업데이트 항목: {변경된 프로퍼티 목록}
```

## Common Update Scenarios

### setup-work 단계 (personal-setup-work에서 호출)
- 블록 콘텐츠 추가 (Brainstorming Summary)
- 상태 → "진행 중"
- Git 저장소 URL 설정 (remote 있을 때만)

### finishing 단계 (finishing-a-development-branch에서 호출)

**필수 업데이트 체크리스트 (누락 금지):**

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
BRANCH_NAME=$(git branch --show-current)

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": {"select": {"name": "완료"}},
      "Git 저장소": {"url": "'"$REPO_URL"'"},
      "Git 브랜치": {"url": "'"$REPO_URL/tree/$BRANCH_NAME"'"},
      "PR": {"url": "<PR_URL>"}
    }
  }'
```

| 프로퍼티 | 값 | 필수 |
|----------|-----|------|
| 상태 | "완료" | **필수** |
| Git 저장소 | `https://github.com/{owner}/{repo}` | **필수** |
| Git 브랜치 | `https://github.com/{owner}/{repo}/tree/{branch}` | **필수** |
| PR | `https://github.com/{owner}/{repo}/pull/{N}` | **필수** (PR 생성 시) |

## Output

반환 값:
- `task_id`: DEV-xxx 형식의 ID
- `page_url`: Notion 페이지 URL

## Error Handling

| 상황 | 대응 |
|------|------|
| Page ID 추출 실패 | URL 형식 확인 안내 |
| 권한 오류 | Integration 연결 확인 안내 |
| 페이지 없음 | 올바른 URL인지 확인 |
| 프로퍼티명 오류 | Property Reference 테이블 확인 |

## Next Step

업데이트 완료 후:
> "페이지가 업데이트되었습니다. Git 브랜치를 생성할까요? (`/sc:git`)"
