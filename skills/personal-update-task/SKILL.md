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

## Notion 호출 도구

모든 Notion REST 호출은 `"$HOME/.claude/tools/notion-api/notion-api" METHOD /v1/PATH [BODY]`로 한다.
BODY는 JSON 파일 경로 또는 `-`(stdin)다. 키와 API 버전은 도구가 정하므로 여기서 지정하지 않는다.
HTTP 400 이상이면 응답 본문을 stderr로 내고 종료 코드 1로 끝난다.

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
"$HOME/.claude/tools/notion-api/notion-api" GET /v1/pages/$PAGE_UUID | jq '{
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
"$HOME/.claude/tools/notion-api/notion-api" PATCH /v1/pages/$PAGE_UUID - <<'EOF'
{
  "properties": {
    "<PROPERTY_NAME>": <PROPERTY_VALUE>
  }
}
EOF
```

**예시 - 상태를 "진행 중"으로 변경:**
```bash
"$HOME/.claude/tools/notion-api/notion-api" PATCH /v1/pages/$PAGE_UUID - <<'EOF'
{
  "properties": {
    "상태": { "select": { "name": "진행 중" } }
  }
}
EOF
```

**예시 - 여러 프로퍼티 동시 업데이트:**
```bash
"$HOME/.claude/tools/notion-api/notion-api" PATCH /v1/pages/$PAGE_UUID - <<'EOF'
{
  "properties": {
    "상태": { "select": { "name": "진행 중" } },
    "Git 브랜치": { "url": "https://github.com/owner/repo/tree/feature/DEV-42-desc" },
    "Git 저장소": { "url": "https://github.com/owner/repo" }
  }
}
EOF
```

### 4. 블록 콘텐츠 추가 (선택)

Brainstorming 요약 등 페이지 본문에 콘텐츠를 추가할 때 사용:

```bash
"$HOME/.claude/tools/notion-api/notion-api" PATCH /v1/blocks/$PAGE_UUID/children - <<'EOF'
{
  "children": [
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": { "rich_text": [] }
    },
    {
      "object": "block",
      "type": "heading_2",
      "heading_2": {
        "rich_text": [{ "text": { "content": "Brainstorming Summary" } }],
        "color": "yellow_background"
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
        "rich_text": [{ "text": { "content": "Design Document" } }],
        "color": "gray_background"
      }
    },
    {
      "object": "block",
      "type": "paragraph",
      "paragraph": {
        "rich_text": [{ "text": { "content": "<repo-root>/docs/plans/<NN>-MMDD-design-<short-topic>.md" } }]
      }
    }
  ]
}
EOF
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
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
BRANCH_NAME=$(git branch --show-current)

# 값은 환경변수로 넘기고 JSON은 python이 만든다 — shell에서 JSON에 변수를 끼우지 않는다
PR_URL="<PR_URL>" REPO_URL="$REPO_URL" BRANCH_NAME="$BRANCH_NAME" python3 -c '
import json, os
e = os.environ
print(json.dumps({"properties": {
    "상태": {"select": {"name": "완료"}},
    "Git 저장소": {"url": e["REPO_URL"]},
    "Git 브랜치": {"url": e["REPO_URL"] + "/tree/" + e["BRANCH_NAME"]},
    "PR": {"url": e["PR_URL"]},
}}, ensure_ascii=False))' | "$HOME/.claude/tools/notion-api/notion-api" PATCH /v1/pages/$PAGE_UUID -
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
