---
name: setup-work
description: Use after brainstorming is complete to create Jira ticket and optionally Git branch - sets up the work environment before implementation planning
---

# Setup Work Environment

## Overview

Brainstorming 결과를 바탕으로 Jira 티켓을 생성하고, 선택적으로 Git 브랜치를 생성합니다.

**두 가지 모드:**
1. **Full Setup**: Jira 티켓 + Git 브랜치 생성 (바로 작업 시작할 때)
2. **Ticket Only**: Jira 티켓만 생성 (나중에 작업할 때)

**작업 재개 시**: 기존 Jira 티켓 URL/ID를 입력하면 브랜치 생성부터 진행

## Standalone 호출

dev-workflow 외부에서도 "Jira 티켓만 만들어줘"라고 요청받을 수 있습니다.
이 경우에도 반드시 아래 User Confirmations의 **6개 필수 항목을 모두** AskUserQuestion으로 질문합니다.

**standalone 호출 시:**
1. design.md/input.md가 없으면 → 사용자에게 직접 제목과 설명을 물어볼 것
2. 6개 필수 필드 (Project, Issue Type, Parent, Labels, Priority, Story Points) 모두 확인
3. 티켓 생성 후 URL 안내

## Prerequisites

- `docs/plans/MMDD-<topic>-input.md` 파일 (parse-slack 결과, 선택)
- `docs/plans/MMDD-<topic>-design.md` 파일 (brainstorming 결과, 단순 작업은 생략 가능)
- **design.md가 없어도 standalone으로 호출 가능** — 사용자에게 직접 Summary/Description 입력받음
- Jira 프로젝트 접근 권한
- Git 저장소 설정 완료

## Process

### 1. Input/Design 파일 읽기

```
docs/plans/MMDD-<topic>-input.md   (parse-slack 결과, 있는 경우)
docs/plans/MMDD-<topic>-design.md  (brainstorming 결과)
```

다음 정보를 추출:

- **제목**: 티켓 Summary
- **개요/목적**: 티켓 Description의 Context
- **접근 방식**: 티켓 Description의 Approach
- **예상 작업**: 티켓 Acceptance Criteria
- **Slack URL**: input.md의 Message Link (있는 경우)
- **요청자**: input.md의 작성자 (있는 경우)

### 2. Jira 티켓 생성

**Jira REST API 사용**

**사용자에게 확인받을 항목** (AskUserQuestion 사용):

- **Issue Type**: Dev / Task / Story / Bug / Incident / Epic
- **Parent**: DEV-2596 / Epic 또는 상위 티켓 선택 (없으면 생략 가능)
- **Labels**: `26_2Q` / `Backend` / `Frontend` / `pf-server-django` / `Datadog` / `개발요청` / `구관사` / `인프라` / `Backlog`
- **Priority**: Critical / High / Medium / Low / Lowest
- **Story Points**: 1 / 2 / 3 / 5 / 8 / 13

**자동 설정 항목**:

- **Assignee**: `~/.claude/CLAUDE.md`에 정의된 Jira 사용자 (Email 기준)
- **Start Date**: 티켓 생성 시점의 현재 날짜/시간

티켓 구조:

```
Project: [사용자에게 확인]
Issue Type: [사용자 선택]
Summary: [design 제목에서 추출]
Assignee: [CLAUDE.md의 Jira Email]
Start Date: [현재 날짜]
Parent: [사용자 선택]
Labels: [사용자 선택]
Priority: [사용자 선택]
Story Points: [사용자 선택] (customfield_10016 + customfield_10031 둘 다 설정)
Description:
  ## Context
  [design 개요]

  ## Approach
  [design 접근 방식 요약]

  ## Slack Request (있는 경우)
  - **Requester**: [input.md 작성자]
  - **Link**: [Slack message URL]

  ## Design Document
  Link: <repo-root>/docs/plans/MMDD-<topic>-design.md

Acceptance Criteria:
  [design에서 추출한 완료 조건]
```

**`<repo-root>`** = `$(git rev-parse --show-toplevel)` 실행 결과 (절대 경로).
예: `/Users/jw/work/pf-server-django/docs/plans/0319-sensitive-data-encryption-design.md`

### 2-1. 기존 docs/plans 파일 rename (티켓 ID 포함)

티켓 생성 후, 기존 `docs/plans/` 파일에 티켓 ID를 추가:

```bash
TICKET_KEY="DEV-XXXX"  # 생성된 티켓 키
TOPIC="<topic>"         # 기존 파일의 topic 부분

# rename 대상: 이 워크플로우에서 생성된 파일들 (input.md, design.md 등)
# 현재 파일명: MMDD-${TOPIC}-*.md → 변환 후: ${TICKET_KEY}-MMDD-${TOPIC}-*.md
cd docs/plans
for f in [0-9][0-9][0-9][0-9]-${TOPIC}-*.md; do
  [ -f "$f" ] || continue
  NEW_NAME="${TICKET_KEY}-${f}"
  mv "$f" "$NEW_NAME"
done
```

예시:
```
0318-admin-slow-query-input.md    → DEV-3405-0318-admin-slow-query-input.md
0318-admin-slow-query-design.md   → DEV-3405-0318-admin-slow-query-design.md
```

**주의:** Jira Description에 이미 기록된 Design Document 경로는 rename 전 이름임. ticket-info.md에 정확한 경로 저장.

### 3. 브랜치 생성 여부 확인

티켓 생성 후 사용자에게 확인:

> "Jira 티켓이 생성되었습니다: DEV-XXXX
>
> 1. **바로 작업 시작** - Git 브랜치 생성 후 `writing-plans`로 진행
> 2. **나중에 작업** - 티켓만 생성하고 종료 (브랜치는 나중에 생성)
>
> 어떻게 진행할까요?"

**옵션 2 (Ticket Only) 선택 시**:
- 6개 필수 필드는 이미 수집 완료 (Step 2에서 확인)
- ticket-info.md 저장 후 종료 (브랜치 정보 없이)
- **IMPORTANT**: "Ticket Only"라도 필수 필드 수집을 생략하지 않음

### 4. Git 브랜치 생성 (옵션 1 선택 시)

**sc:git 스킬 활용**

**Step 0: GitHub 계정 확인 (필수)**

업무 프로젝트는 반드시 `kimwoz` 계정을 사용합니다:
```bash
CURRENT_GH_USER=$(gh api user -q '.login' 2>/dev/null)
if [ "$CURRENT_GH_USER" != "kimwoz" ]; then
  gh auth switch --user kimwoz
fi
```

| 디렉토리 | GitHub 계정 | 용도 |
|----------|------------|------|
| `~/prv/*` | `jongwoo315` | 개인 프로젝트 |
| 그 외 | `kimwoz` | myplaycompany 업무 |

**중요**: `CLAUDE.md`에 Commit Conventions가 정의되어 있으면 해당 규칙을 따릅니다.

**CRITICAL: 자동 checkout 금지**
- `git checkout -b` 대신 `git branch <name>` 사용 (checkout 없이 브랜치만 생성)
- 같은 레포에서 여러 세션이 동시 작업할 수 있으므로, 현재 브랜치를 변경하면 안 됨
- 실제 checkout은 executing-plans 세션 시작 시 또는 worktree 생성 시에 수행

브랜치 명명 규칙 (CLAUDE.md 규칙 우선):

```
{type}/{TICKET-ID}-{short-description}
```

예시:

- `feature/PROJ-123-slack-message-parser`
- `bugfix/PROJ-456-fix-auth-redirect`
- `improvement/PROJ-789-optimize-query`

**참고**: 프로젝트 CLAUDE.md의 Commit Conventions 섹션을 확인하여 브랜치 타입 및 명명 규칙을 따르세요.

### 5. 결과 저장

`docs/plans/<TICKET-KEY>-MMDD-<topic>-ticket-info.md` 생성:

```markdown
# Work Environment - {날짜}

## Jira Ticket

- **ID**: PROJ-123
- **URL**: https://your-domain.atlassian.net/browse/PROJ-123
- **Type**: Story

## Git Branch

- **Name**: feature/PROJ-123-slack-message-parser
- **Base**: main

## Slack Request (있는 경우)

- **Requester**: [요청자]
- **Link**: [Slack message URL]

## Related Files

- Input: docs/plans/<TICKET-KEY>-MMDD-<topic>-input.md
- Design: docs/plans/<TICKET-KEY>-MMDD-<topic>-design.md
```

## User Confirmations

**IMPORTANT**: 아래 6개 항목을 반드시 AskUserQuestion으로 질문해야 함. 빠뜨리지 말 것!

티켓 생성 전 필수 선택 항목 (AskUserQuestion 사용):

1. **Project**: DEV / PLAB / Other
2. **Issue Type**: Dev / Task / Story / Bug / Incident / Epic
3. **Parent** (Epic/상위 티켓): DEV-2596 / 선택 또는 "없음"
4. **Labels**: `26_2Q` / `Backend` / `Frontend` / `pf-server-django` / `Datadog` / `개발요청` / `구관사` / `인프라` / `Backlog`
5. **Priority**: Critical / High / Medium / Low / Lowest
6. **Story Points**: 1 / 2 / 3 / 5 / 8 / 13

**주의**: 위 6개 항목 모두 AskUserQuestion에 포함해야 함!

티켓 생성 전 최종 확인:

> "다음 정보로 Jira 티켓을 생성합니다:
>
> - Project: [선택한 값]
> - Issue Type: [선택한 값]
> - Summary: ...
> - Assignee: [CLAUDE.md에서 가져온 이메일]
> - Start Date: [오늘 날짜]
> - Parent: [선택한 값]
> - Labels: [선택한 값]
> - Priority: [선택한 값]
> - Story Points: [선택한 값]
>
> 진행할까요?"

브랜치 생성 전 확인:

> "브랜치명: `feature/PROJ-123-short-desc`
> Base branch: main
>
> 진행할까요?"

## Jira API Implementation

**CRITICAL**: 티켓 생성 시 반드시 아래 필드들을 포함해야 함.

### Custom Field IDs (myplaycompany.atlassian.net)

```
customfield_10015: Start Date (YYYY-MM-DD 형식)
customfield_10016: Story point estimate (숫자) - Jira Software 내장 필드
customfield_10031: Story Points (숫자) - 보드 estimation용 필드 (PLAB OS 보드에서 사용)
customfield_10014: Epic Link / Parent
```

**IMPORTANT**: Story Points는 반드시 두 필드 모두에 저장해야 합니다:
- `customfield_10016` (Story point estimate) - Jira 이슈 상세에서 표시
- `customfield_10031` (Story Points) - Scrum 보드 estimation에서 표시

### Assignee 설정

1. 먼저 accountId 조회 필요:

```bash
curl -s -X GET \
  -H "Authorization: Basic $(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)" \
  "https://myplaycompany.atlassian.net/rest/api/3/user/search?query=jongwoo.kim@plabfootball.com" \
  | jq -r '.[0].accountId'
```

2. 티켓 생성 시 accountId 사용:

```json
"assignee": {"accountId": "712020:a7dec654-3a3b-432d-a825-9a38531ddc78"}
```

### 필수 체크리스트

티켓 생성 API 호출 전 반드시 확인:

- [ ] `issuetype.name` 포함 - 사용자 선택값 (Dev / Task / Story / Bug / Incident / Epic)
- [ ] `assignee.accountId` 포함
- [ ] `customfield_10015` (Start Date) 포함 - 오늘 날짜
- [ ] `customfield_10016` (Story point estimate) 포함 - 사용자 선택값
- [ ] `customfield_10031` (Story Points) 포함 - 사용자 선택값과 동일한 값
- [ ] `priority.name` 포함 - 사용자 선택값
- [ ] `parent.key` 포함 (선택한 경우)

## Error Handling

| 상황                          | 대응                                          |
| ----------------------------- | --------------------------------------------- |
| input.md, design.md 모두 없음 | brainstorming 또는 parse-slack 먼저 실행 안내 |
| Jira 생성 실패                | 에러 표시, Git 브랜치는 수동 생성 옵션 제공   |
| Git 브랜치 실패               | 에러 표시, 수동 생성 명령어 제공              |

## Next Step

### Full Setup 완료 시 (브랜치 생성됨):

> "작업 환경이 준비되었습니다.
>
> - Jira: PROJ-123
> - Branch: feature/PROJ-123-...
>
> `superpowers:writing-plans`로 구현 계획을 작성할까요?"

### Ticket Only 완료 시 (브랜치 미생성):

> "Jira 티켓이 생성되었습니다.
>
> - Jira: PROJ-123
> - URL: https://myplaycompany.atlassian.net/browse/PROJ-123
>
> 나중에 작업을 재개하려면 티켓 URL을 입력하세요."

## Resume Work (기존 티켓에서 재개)

**사용자가 Jira 티켓 URL/ID를 입력하면:**

1. 티켓 정보 조회 (gh api 또는 curl)
2. 티켓에서 Summary, Description 추출
3. Git 브랜치 생성
4. `superpowers:writing-plans`로 이동

> "기존 티켓에서 작업을 재개합니다.
>
> - Jira: PROJ-123 - [티켓 제목]
>
> 브랜치를 생성할까요?"
