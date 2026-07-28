---
name: personal-create-task
description: Creates a new task in the personal Notion database (프로젝트 진행) with auto-filled content from brainstorming
---

# Create Personal Notion Task

## Overview

개인 프로젝트용 Notion 태스크 데이터베이스에 새 페이지를 생성합니다.

**Database:** 프로젝트 진행
**Database ID:** `29241e61-65c0-801f-9529-cabf8cad919b`

## ⚠️ 무인 실행 전제 (dev-workflow Phase A)

이 스킬은 `dev-workflow` autonomous pipeline 안에서 호출된다.
**`AskUserQuestion`을 쓰지 않는다.** 게이트는 Kickoff(plan 승인)와 PR 리뷰 둘뿐이며
태스크 생성은 그 사이 무인 구간이다.

- **프로젝트명**은 호출자가 인자로 넘긴다. 못 정하면 `docs/plans/` 설계 문서 제목과
  기존 `프로젝트` 옵션을 문자열 매칭해 고른다. 그래도 없으면 **새 옵션으로 생성**한다
  (select 프로퍼티는 페이지 생성 시 옵션이 자동 추가된다).
- **ID 표기는 `#NN`.** 실제 unique_id는 `{"prefix": null, "number": 86}` 이라 접두사가 없다.
  `DEV-86`으로 쓰지 않는다 — `DEV-`는 Jira 티켓 형식이라 로그에서 구분이 안 된다.

## Prerequisites

- `NOTION_API_KEY` 환경변수 설정 (`~/.zshenv`)
- Brainstorming 완료 (design.md 파일 존재)

## API Key 추출

**주의:** `source ~/.zshenv`는 zle hook 경고가 대량 출력되므로 사용하지 않음.

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
```

## Database Property Reference

| 프로퍼티 | 타입 | 생성 시 JSON 형식 | 비고 |
|----------|------|-------------------|------|
| 태스크 | title | `"태스크": {"title": [{"text": {"content": "..."}}]}` | 필수 |
| 상태 | select | `"상태": {"select": {"name": "시작 전"}}` | 옵션: 시작 전, 진행 중, 완료 |
| 프로젝트 | select | `"프로젝트": {"select": {"name": "..."}}` | 없는 이름이면 옵션 자동 생성 |
| 작업일 | date **range** | `"작업일": {"date": {"start": "YYYY-MM-DD"}}` | 착수 시 `start`, 머지 후 `end` 추가 |
| Git 저장소 | url | `"Git 저장소": {"url": "https://..."}` | GitHub repo URL |
| Git 브랜치 | url | `"Git 브랜치": {"url": "https://..."}` | 착수 시 설정 (push 전에도 URL 조립 가능) |
| PR | url | `"PR": {"url": "https://..."}` | PR 생성 직후 설정 |
| ID | unique_id | 자동 생성 (읽기 전용) | prefix 없음 → `#86` |
| 선행 작업 | relation | `"선행 작업": {"relation": [{"id": "page-uuid"}]}` | 선택 |
| 후속 작업 | relation | `"후속 작업": {"relation": [{"id": "page-uuid"}]}` | 선택 |

**존재하지 않는 프로퍼티:** `생성일`. 과거 문서에 있었으나 DB에 없다 — 넣으면 400이 난다.
실제 프로퍼티는 위 10개가 전부다.

## Process

### 1. Brainstorming 결과 읽기

```
docs/plans/MMDD-design-<short-topic>.md
```

**파일명 규칙은 `rules/dev-workflow.md`의 `## docs/plans 파일 규칙`을 따른다** —
날짜는 `MMDD`(YYMMDD 아님), **type이 topic보다 앞**. 티켓 ID 확정 후
`<ID>-MMDD-design-<short-topic>.md`로 rename.

다음 정보 추출:
- **태스크명**: design 제목에서 추출
- **요약**: Overview 섹션 요약
- **상세 내용**: 전체 design 요약

### 2. 프로젝트 결정 (질문 금지)

우선순위:
1. 호출자가 넘긴 프로젝트명
2. 기존 옵션 중 설계 문서 제목/repo명과 매칭되는 것
3. 없으면 repo명 기준으로 **새 옵션 생성** (select는 자동 추가됨)

기존 프로젝트 목록 조회:
```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)

curl -s -X POST "https://api.notion.com/v1/databases/29241e6165c0801f9529cabf8cad919b/query" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{"page_size": 100}' | jq -r '[.results[].properties.프로젝트.select.name] | unique | .[]'
```

### 3. Git 저장소 URL 감지

```bash
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
```

remote가 있으면 `Git 저장소` 프로퍼티에 포함. 없으면 생략 — `personal-setup-work`가 remote 생성 후 채운다.

### 4. Notion 페이지 생성

**주의:** JSON을 shell 변수로 조립하면 trailing comma 등으로 invalid JSON이 될 수 있음. 반드시 python3으로 JSON을 구성할 것.

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
TODAY=$(date +%Y-%m-%d)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')

python3 -c "
import json, subprocess, sys

properties = {
    '태스크': {'title': [{'text': {'content': '<TASK_NAME>'}}]},
    '상태': {'select': {'name': '시작 전'}},
    '프로젝트': {'select': {'name': '<PROJECT_NAME>'}},
}
# 주의: '생성일' 프로퍼티는 DB에 없다. 넣으면 400.
# '작업일'은 착수 시점(personal-setup-work)에 start를 넣는다 — 생성 시점 아님.

repo_url = '$REPO_URL'
if repo_url:
    properties['Git 저장소'] = {'url': repo_url}

payload = {
    'parent': {'database_id': '29241e6165c0801f9529cabf8cad919b'},
    'properties': properties,
    'children': [
        {
            'object': 'block', 'type': 'heading_2',
            'heading_2': {'rich_text': [{'text': {'content': 'Summary'}}]}
        },
        {
            'object': 'block', 'type': 'paragraph',
            'paragraph': {'rich_text': [{'text': {'content': '<SUMMARY>'}}]}
        },
        {
            'object': 'block', 'type': 'heading_2',
            'heading_2': {'rich_text': [{'text': {'content': 'Design Document'}}]}
        },
        {
            'object': 'block', 'type': 'paragraph',
            'paragraph': {'rich_text': [{'text': {'content': 'See: docs/plans/MMDD-design-<short-topic>.md'}}]}
        },
    ],
}

result = subprocess.run(
    ['curl', '-s', '-X', 'POST', 'https://api.notion.com/v1/pages',
     '-H', 'Authorization: Bearer $NOTION_API_KEY',
     '-H', 'Content-Type: application/json',
     '-H', 'Notion-Version: 2022-06-28',
     '-d', json.dumps(payload)],
    capture_output=True, text=True
)
print(result.stdout)
"
```

### 5. 결과 파싱

응답에서 추출:
- `id`: 페이지 ID (UUID 형식)
- `url`: 페이지 URL
- `properties.ID.unique_id.number`: 태스크 번호 (예: 86). prefix 없음

```bash
# 응답 파싱 예시
response='<API_RESPONSE>'
page_id=$(echo "$response" | jq -r '.id')
page_url=$(echo "$response" | jq -r '.url')
task_number=$(echo "$response" | jq -r '.properties.ID.unique_id.number')   # prefix 없음 → #86
```

### 6. 결과 출력

```
Notion 태스크가 생성되었습니다:
- ID: #{number}
- URL: {page_url}
- 태스크: {task_name}
- 프로젝트: {project_name}
```

## Output

반환 값:
- `task_number`: 정수 태스크 번호 (예: 86). 표기는 `#86`
- `page_url`: Notion 페이지 URL
- `task_name`: 태스크 제목

## Error Handling

| 상황 | 대응 |
|------|------|
| API Key 없음 | `~/.zshenv`에서 NOTION_API_KEY 설정 안내 |
| 권한 오류 | Integration이 database에 연결되어 있는지 확인 안내 |
| 프로젝트 없음 | repo명으로 새 select 옵션 생성 (질문 금지) |

## Next Step

생성 완료 후:
`personal-setup-work`가 이어서 worktree·브랜치·Notion 착수 필드를 처리한다. 질문 없이 진행.
