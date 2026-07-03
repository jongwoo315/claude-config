---
name: personal-setup-work
description: Orchestrates post-brainstorming setup for personal projects - creates/updates Notion task and Git branch
---

# Personal Setup Work

## Overview

Brainstorming 완료 후 개인 프로젝트 작업 환경을 설정합니다:
1. Notion 태스크 생성 또는 업데이트
2. Git 브랜치 생성 (`/sc:git` 활용)

**개인 프로젝트 판별:** `~/prv/` 디렉토리에서 작업 중

## Prerequisites

- `NOTION_API_KEY` 환경변수 설정
- Brainstorming 완료 (`docs/plans/MMDD-<topic>-design.md`)
- Git 저장소 초기화 완료

## Process

### 1. 기존 Notion 태스크 확인

**AskUserQuestion으로 확인:**

> "이 작업에 대한 Notion 태스크가 이미 있나요?"
> - A) 예 - 페이지 URL 입력
> - B) 아니오 - 새로 생성

### 2a. 기존 태스크가 있는 경우

`personal-update-task` 스킬 호출:
- Notion URL에서 Page ID 추출
- Brainstorming 요약 추가
- DEV-xxx ID 반환

### 2b. 새 태스크 생성하는 경우

`personal-create-task` 스킬 호출:
- design.md에서 정보 추출
- 프로젝트 선택 (AskUserQuestion)
- Notion 페이지 생성
- DEV-xxx ID 반환

### 2-1. 기존 docs/plans 파일 rename (태스크 ID 포함)

태스크 생성/확인 후, 기존 `docs/plans/` 파일에 태스크 ID를 추가:

```bash
TASK_ID="DEV-XX"  # Notion unique_id (예: DEV-42)
TOPIC="<topic>"

# 현재 파일명: MMDD-${TOPIC}-*.md → 변환 후: ${TASK_ID}-MMDD-${TOPIC}-*.md
cd docs/plans
for f in [0-9][0-9][0-9][0-9]-${TOPIC}-*.md; do
  [ -f "$f" ] || continue
  NEW_NAME="${TASK_ID}-${f}"
  mv "$f" "$NEW_NAME"
done
```

예시: `0318-toolnest-design.md` → `DEV-42-0318-toolnest-design.md`

### 3. Git 브랜치 생성

**AskUserQuestion으로 확인:**

> "브랜치 타입을 선택하세요:"
> - A) feature - 새 기능
> - B) fix - 버그 수정
> - C) bug - 버그 수정 (fix와 동일)

**브랜치명 생성:**
```
{type}/DEV-{id}-{description}
```

- `{type}`: 선택된 타입 (feature/fix/bug)
- `{id}`: Notion unique_id 번호
- `{description}`: 태스크명에서 자동 생성 (slugified)

**Description 생성 로직:**
```bash
# 한글 포함 시: 영어로 변환하거나 사용자 입력
# 영어만 있을 때: slugify
echo "Add Dark Mode Feature" | \
  tr '[:upper:]' '[:lower:]' | \
  tr ' ' '-' | \
  sed 's/[^a-z0-9-]//g'
# 결과: add-dark-mode-feature
```

**사용자 확인:**
> "브랜치명: `feature/DEV-42-add-dark-mode`"
> "수정이 필요하면 입력하세요. 그대로 진행하려면 Enter."

**`/sc:git` 호출:**
```
/sc:git branch {branch_name}
```

### 4. Git Remote 체크 및 생성

브랜치 생성 후, GitHub remote가 존재하는지 확인합니다.
**프로젝트의 첫 태스크인 경우 remote가 없을 수 있음.**

**Step 0: GitHub 계정 확인 (필수)**

개인 프로젝트(`~/prv/`)는 반드시 `jongwoo315` 계정을 사용합니다:
```bash
CURRENT_GH_USER=$(gh api user -q '.login' 2>/dev/null)
if [ "$CURRENT_GH_USER" != "jongwoo315" ]; then
  gh auth switch --user jongwoo315
fi
```

| 디렉토리 | GitHub 계정 | 용도 |
|----------|------------|------|
| `~/prv/*` | `jongwoo315` | 개인 프로젝트 |
| 그 외 | `kimwoz` | myplaycompany 업무 |

**Step 1: Remote 존재 여부 확인**
```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
```

**Step 2: Remote가 없는 경우 → AskUserQuestion**

> "Git remote(origin)가 설정되어 있지 않습니다. GitHub 저장소를 생성할까요?"
> - A) Private 저장소 생성 (Recommended)
> - B) Public 저장소 생성
> - C) 나중에 설정 (Git URL 프로퍼티는 비워둠)

**Step 3: GitHub 저장소 생성 (A 또는 B 선택 시)**

저장소 이름은 현재 디렉토리 이름에서 추출:
```bash
REPO_NAME=$(basename "$PWD")
GH_USER=$(gh api user -q '.login')
```

```bash
# Private
gh repo create "$REPO_NAME" --private --source=. --remote=origin

# Public
gh repo create "$REPO_NAME" --public --source=. --remote=origin
```

**주의:** `gh repo create --source=.`는 remote를 설정하지만 push는 하지 않음. push는 worktree/checkout 단계 이후에 수행.

**Step 4: Remote URL 확인**
```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
REPO_URL=$(echo "$REMOTE_URL" | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
echo "Repo URL: $REPO_URL"
```

### 5. Notion 페이지 상태 업데이트

이 단계에서는 `상태`와 `Git 저장소`(remote 있을 때)만 설정합니다.
`Git 브랜치` URL과 `PR` URL은 브랜치가 push되고 PR이 생성된 후인
**`finishing-a-development-branch`(Step 6)에서 설정합니다.**

**Case A: Remote가 있는 경우**
```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')

TODAY=$(date +%Y-%m-%d)

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "진행 중" } },
      "작업일": { "date": { "start": "'$TODAY'" } },
      "Git 저장소": { "url": "'$REPO_URL'" }
    }
  }'
```

**Case B: Remote가 없는 경우 (사용자가 "나중에 설정" 선택)**
```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
TODAY=$(date +%Y-%m-%d)

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "진행 중" } },
      "작업일": { "date": { "start": "'$TODAY'" } }
    }
  }'
```

- `PAGE_UUID`: 2a/2b 단계에서 반환된 Notion 페이지 ID
- 프로퍼티 형식은 `personal-update-task` 스킬의 Property Update Reference 참조

**Notion 프로퍼티 업데이트 시점 정리:**

| 프로퍼티 | 설정 시점 | 이유 |
|----------|-----------|------|
| 상태 → 진행 중 | setup-work (여기) | 작업 시작 시 |
| 작업일 (시작일) | setup-work (여기) | 작업 시작일 기록 |
| Git 저장소 | setup-work (여기, remote 있을 때) | remote 존재 시 바로 설정 가능 |
| Git 브랜치 | finishing (Step 6) | push 후에야 GitHub URL 존재 |
| PR | finishing (Step 6) | PR 생성 후에야 URL 존재 |
| Git 저장소 (보완) | finishing (Step 6, 미설정 시) | setup에서 remote 없었던 경우 |
| 작업일 (종료일) | PR merge 후 | merge 시점이 실제 완료일 |
| 상태 → 완료 | PR merge 후 | merge되어야 작업 완료 |

### 6. 결과 저장

`docs/plans/<TASK-ID>-MMDD-<topic>-work-info.md` 생성:

```markdown
# Work Environment - {날짜}

## Notion Task
- **ID**: DEV-{number}
- **URL**: {notion_url}
- **프로젝트**: {project_name}

## Git Branch
- **Name**: {branch_name}
- **Base**: main

## Related Files
- Design: docs/plans/DEV-XX-MMDD-<topic>-design.md
```

### 7. 완료 메시지

```
작업 환경이 준비되었습니다:
- Notion: DEV-{id} ({notion_url})
- Branch: {branch_name}

`superpowers:writing-plans`로 구현 계획을 작성할까요?
```

## Note: Finishing 단계 — PR 생성 시 vs PR Merge 시

### PR 생성 시 (finishing-a-development-branch)

PR 생성 직후에는 `Git 브랜치`, `PR`, `Git 저장소`만 업데이트한다.
**`상태`와 `작업일 종료일`은 이 시점에서 업데이트하지 않는다.**

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
BRANCH_NAME=$(git branch --show-current)
BRANCH_URL="${REPO_URL}/tree/${BRANCH_NAME}"

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "Git 브랜치": { "url": "'$BRANCH_URL'" },
      "Git 저장소": { "url": "'$REPO_URL'" },
      "PR": { "url": "<PR_URL>" }
    }
  }'
```

### PR Merge 후

PR이 main에 merge된 후에 `상태 → 완료`와 `작업일 종료일`을 업데이트한다.

**주의:** `작업일`은 date range 프로퍼티. setup-work에서 `start`만 설정했으므로, 여기서 `start`를 유지하면서 `end`를 추가해야 한다. 기존 `start` 값을 먼저 조회한 후 `end`와 함께 설정한다.

```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
TODAY=$(date +%Y-%m-%d)

# 기존 작업일 시작일 조회
START_DATE=$(curl -s -X GET "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Notion-Version: 2022-06-28" | jq -r '.properties."작업일".date.start // "'$TODAY'"')

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "완료" } },
      "작업일": { "date": { "start": "'$START_DATE'", "end": "'$TODAY'" } }
    }
  }'
```

## Error Handling

| 상황 | 대응 |
|------|------|
| design.md 없음 | brainstorming 먼저 실행 안내 |
| Notion 생성/업데이트 실패 | 에러 표시, 수동 생성 옵션 |
| Git 브랜치 실패 | 수동 생성 명령어 제공 |
| Git remote 없음 (첫 태스크) | Step 4에서 GitHub 저장소 생성 제안 |
| `gh` CLI 미설치/미인증 | `brew install gh && gh auth login` 안내 |
| ~/prv/ 아닌 경우 | work 워크플로우(`setup-work`) 안내 |

## Detection Logic

```bash
# 현재 디렉토리가 ~/prv/ 하위인지 확인
if [[ "$PWD" == "$HOME/prv/"* ]]; then
  echo "Personal project detected - use personal-setup-work"
else
  echo "Work project - use setup-work instead"
fi
```
