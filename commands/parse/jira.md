---
name: parse-jira
description: Use when starting a task from a Jira ticket URL - extracts ticket summary, description, status, and metadata for downstream processing
---

# Parse Jira Ticket

## Overview

Jira URL에서 티켓의 핵심 정보를 추출하여 `docs/plans/`에 저장합니다.

**추출 대상:**
- 티켓 메타데이터 (Type, Status, Priority, Assignee, Labels 등)
- Description (ADF → Markdown 변환)
- Parent ticket 정보
- Comments (최신 10개)

## When to Use

- Jira 티켓 URL을 받아서 작업을 시작할 때
- 이슈/기능 요청이 Jira에 있을 때
- 티켓의 전체 컨텍스트가 필요할 때

## Environment

```bash
# Auth: Jira API Token (Basic Auth)
EMAIL="jongwoo.kim@plabfootball.com"
# $JIRA_API_TOKEN은 환경변수에서 사용
BASE_URL="https://myplaycompany.atlassian.net"
```

## Process

### 1. URL에서 Ticket Key 추출

Jira URL 형식:
- `https://myplaycompany.atlassian.net/browse/DEV-1234`
- `https://myplaycompany.atlassian.net/browse/DEV-1234?...` (query params 무시)

```bash
JIRA_URL="$ARGUMENTS"
# Query string 및 fragment 제거 후 ticket key 추출
TICKET_KEY=$(echo "$JIRA_URL" | sed 's/[?#].*//' | grep -oE '[A-Z]+-[0-9]+' | tail -1)
```

### 2. API 호출 (단일 요청)

**중요: JQL search 엔드포인트를 사용** (direct issue endpoint는 권한 문제로 실패할 수 있음)

**필수 필드만 요청하여 응답 크기를 최소화:**

```bash
# rtk proxy로 raw JSON 응답 받기 (rtk 필터링 방지)
# 결과를 파일로 저장 (Python에서 읽기 위해)
rtk proxy curl -s -u "$EMAIL:$JIRA_API_TOKEN" \
  "$BASE_URL/rest/api/3/search/jql?jql=key=$TICKET_KEY&maxResults=1&fields=summary,description,status,assignee,reporter,priority,issuetype,created,updated,labels,components,parent,comment" \
  > /tmp/jira_response.json
```

**성능 핵심:**
- `fields=...` 파라미터로 필요한 필드만 요청
- `/rest/api/3/search/jql` 엔드포인트 사용 (deprecated `/rest/api/3/search` 아님)
- 단일 API 호출로 comment까지 포함
- **`rtk proxy` 필수** — rtk 토큰 필터가 JSON 구조를 변형하여 파싱 실패 유발
- **파일 저장 필수** — Python에서 `/tmp/jira_response.json`으로 읽기

### 3. ADF (Atlassian Document Format) → Markdown 변환

Jira description은 ADF JSON 형식입니다. 아래 규칙으로 Markdown 변환:

| ADF Type | Markdown 변환 |
|----------|---------------|
| `paragraph` | `rich_text` 추출 → 텍스트 |
| `heading` (level 1-6) | `#` ~ `######` |
| `bulletList` / `listItem` | `- item` |
| `orderedList` / `listItem` | `1. item` |
| `codeBlock` | ````language\n...\n```` |
| `blockquote` | `> text` |
| `table` / `tableRow` / `tableCell` | Markdown table |
| `inlineCard` | `attrs.url` 추출 |
| `mediaInline` / `mediaSingle` | 이미지/파일 URL |
| `hardBreak` | `\n` |
| `text` (marks: `strong`) | `**text**` |
| `text` (marks: `em`) | `*text*` |
| `text` (marks: `code`) | `` `text` `` |
| `text` (marks: `link`) | `[text](url)` |

**Python으로 변환 처리:**

**실행 방법 (중요):**
1. Python 코드는 **Bash heredoc**으로 `/tmp/parse_jira.py`에 저장 후 실행. (Write 도구는 새 파일도 Read 선행 필요 → `/tmp` 임시 파일에 부적합)
   ```bash
   cat > /tmp/parse_jira.py << 'PYEOF'
   # Python code here...
   PYEOF
   python3 /tmp/parse_jira.py
   ```
2. 파일 첫 줄에 `# -*- coding: utf-8 -*-` 인코딩 선언 필수 (한국어 포함).
3. f-string 안에서 따옴표 충돌 주의: `"#" * level` 대신 `'#' * level` 사용하거나 string concatenation 사용.
4. curl 응답을 JSON 파일로 저장 후 Python에서 읽기 (`rtk proxy curl ... > /tmp/jira_response.json`).

ADF → Markdown 변환 참고 구현:

```python
# -*- coding: utf-8 -*-
import json, sys

def adf_to_markdown(node, depth=0):
    if not node or not isinstance(node, dict):
        return ""

    node_type = node.get("type", "")
    content = node.get("content", [])

    if node_type == "text":
        text = node.get("text", "")
        for mark in node.get("marks", []):
            mark_type = mark.get("type")
            if mark_type == "strong":
                text = "**" + text + "**"
            elif mark_type == "em":
                text = "*" + text + "*"
            elif mark_type == "code":
                text = "`" + text + "`"
            elif mark_type == "link":
                url = mark.get("attrs", {}).get("href", "")
                text = "[" + text + "](" + url + ")"
        return text

    if node_type == "hardBreak":
        return "\n"

    if node_type == "inlineCard":
        return node.get("attrs", {}).get("url", "")

    children_text = "".join(adf_to_markdown(c, depth) for c in content)

    if node_type == "paragraph":
        return children_text + "\n\n"
    elif node_type == "heading":
        level = node.get("attrs", {}).get("level", 1)
        # NOTE: f-string 대신 concatenation 사용 (bash inline 실행 시 따옴표 충돌 방지)
        return "#" * level + " " + children_text + "\n\n"
    elif node_type == "bulletList":
        return children_text + "\n"
    elif node_type == "orderedList":
        lines = []
        for i, item in enumerate(content, 1):
            item_text = "".join(adf_to_markdown(c, depth) for c in item.get("content", []))
            lines.append(str(i) + ". " + item_text.strip())
        return "\n".join(lines) + "\n\n"
    elif node_type == "listItem":
        return "- " + children_text.strip() + "\n"
    elif node_type == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        return "```" + lang + "\n" + children_text + "```\n\n"
    elif node_type == "blockquote":
        return "> " + children_text.strip().replace("\n", "\n> ") + "\n\n"
    elif node_type == "table":
        return children_text
    elif node_type == "tableRow":
        cells = [adf_to_markdown(c, depth).strip() for c in content]
        return "| " + " | ".join(cells) + " |\n"
    elif node_type in ("tableCell", "tableHeader"):
        return children_text
    elif node_type == "doc":
        return children_text

    return children_text

# 파일에서 API 응답 JSON 읽기 (stdin 대신)
with open("/tmp/jira_response.json", "r") as f:
    data = json.load(f)
```

### 4. 결과 저장

결과를 `docs/plans/<TICKET-KEY>-MMDD-<topic>-input.md`에 저장:

```markdown
# Jira Input - {TICKET_KEY}: {summary}

**Source:** {original_url}
**Parsed:** {timestamp}

## Ticket Info

| 항목 | 값 |
|------|-----|
| Key | {key} |
| Type | {issuetype} |
| Status | {status} |
| Priority | {priority} |
| Assignee | {assignee} |
| Reporter | {reporter} |
| Labels | {labels} |
| Parent | {parent_key} - {parent_summary} |
| Created | {created} |
| Updated | {updated} |

## Description

{description을 ADF → Markdown 변환}

## Comments (최신 10개)

1. **{author}** ({timestamp}):
   > {comment_body}

## Metadata

- **Ticket URL:** {original_url}
- **Project:** {project_key}
```

**파일 네이밍:** `docs/plans/<TICKET-KEY>-MMDD-<topic>-input.md`
- 예: `DEV-3763-0409-googwansa-traffic-zero-input.md`
- `<TICKET-KEY>`는 대문자 유지 (예: `DEV-3763`)
- `<topic>`은 티켓 summary에서 추출한 slug

## Error Handling

```bash
# 티켓을 찾지 못한 경우
if [ "$(echo $RESPONSE | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get("issues",[])))')" = "0" ]; then
  echo "Error: Ticket $TICKET_KEY not found"
  echo "Possible causes:"
  echo "  - 티켓 키가 올바른지 확인 ($TICKET_KEY)"
  echo "  - JIRA_API_TOKEN이 유효한지 확인"
  echo "  - 프로젝트 접근 권한 확인"
fi
```

## Output

- 파일 경로: `docs/plans/<TICKET-KEY>-MMDD-<topic>-input.md`
- 파싱된 내용을 사용자에게 요약하여 표시

## Next Step

파싱 완료 후 사용자에게 확인:
> "Jira 티켓을 파싱했습니다. 내용을 확인해주세요."

<!-- SYNC: parse/jira.md, parse/slack.md, parse/notion.md -->
그 후 워크플로우를 선택합니다.

**이슈 타입이 Bug / Incident인 경우 `systematic-debugging`을 먼저 추천할 것.**

> "어떤 워크플로우로 진행할까요?"
> 1. **dev-workflow** — 프로세스 중심 (계획 → 추적 → 실행 → 검증)
> 2. **debugging-workflow** — 버그/이슈 근본 원인 분석 후 수정 (Bug/Incident 티켓 추천)
> 3. **ralph-dev** — 자율 반복 (well-defined tasks, clear success criteria)
> 4. **직접 진행** — 워크플로우 없이 직접 작업
