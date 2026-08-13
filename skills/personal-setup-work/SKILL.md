---
name: personal-setup-work
description: Orchestrates post-brainstorming setup for personal projects - creates/updates Notion task and Git branch
---

# Personal Setup Work

## Overview

Brainstorming 완료 후 개인 프로젝트 작업 환경을 설정합니다:
1. Notion 태스크 생성 또는 업데이트
2. **worktree 생성** (`~/prv/.wt/<NN>-<subject>`)
3. 브랜치 생성 + Notion 착수 필드 갱신

**개인 프로젝트 판별:** `~/prv/` 디렉토리에서 작업 중

## ⚠️ 무인 실행 전제 (dev-workflow Phase A)

이 스킬은 `dev-workflow` autonomous pipeline 안에서 호출된다.
**`AskUserQuestion`을 쓰지 않는다.** 게이트는 Kickoff(plan 승인)와 PR 리뷰 둘뿐이다.

기존에 질문으로 받던 것들의 **기본값**:

| 항목 | 기본값 |
| --- | --- |
| 기존 태스크 유무 | 호출자가 태스크 번호를 넘기면 update, 아니면 create |
| 브랜치 타입 | `feat` (버그 수정이 명확하면 `fix`) |
| GitHub 저장소 생성 | **private** — remote 없으면 질문 없이 생성 |
| 프로젝트명 | `personal-create-task` 규칙에 위임 |

**ID 표기는 `#NN`** — Notion unique_id는 prefix가 없다(`{"prefix": null, "number": 86}`).
`DEV-`는 Jira 형식이므로 쓰지 않는다.

## Prerequisites

- `NOTION_API_KEY` 환경변수 설정
- Brainstorming 완료 (`docs/plans/MMDD-design-<short-topic>.md`)
- Git 저장소 초기화 완료

## Process

### 1. 기존 Notion 태스크 확인 (질문 금지)

호출자가 태스크 번호(`#NN`) 또는 페이지 URL을 넘겼으면 **2a**, 아니면 **2b**.
설계 문서에 이미 태스크 표가 있으면(예: 설계 문서 §태스크) 거기서 번호를 읽는다.

### 2a. 기존 태스크가 있는 경우

`personal-update-task` 스킬 호출:
- Notion URL에서 Page ID 추출
- Brainstorming 요약 추가
- 태스크 번호(`#NN`) 반환

### 2b. 새 태스크 생성하는 경우

`personal-create-task` 스킬 호출:
- design.md에서 정보 추출
- 프로젝트 결정 (질문 없음 — `personal-create-task` 규칙에 위임)
- Notion 페이지 생성
- 태스크 번호(`#NN`) 반환

### 2-1. 기존 docs/plans 파일 rename (태스크 ID 포함)

태스크 생성/확인 후, 기존 `docs/plans/` 파일에 태스크 ID를 추가:

**파일명 규칙은 `rules/dev-workflow.md`의 `## docs/plans 파일 규칙`을 따른다** —
`MMDD-<type>-<short-topic>.md` → `<NN>-MMDD-<type>-<short-topic>.md`.
날짜는 `MMDD`(YYMMDD 아님), **type이 topic보다 앞**.

```bash
NN="86"           # Notion unique_id 숫자. prefix 없음
TOPIC="<short-topic>"

cd docs/plans
for f in [0-9][0-9][0-9][0-9]-*-${TOPIC}.md; do
  [ -f "$f" ] || continue
  mv "$f" "${NN}-${f}"
done
```

예시: `0727-design-upgrade-impact.md` → `86-0727-design-upgrade-impact.md`

### 3. Worktree + 브랜치 생성 (질문 금지)

**브랜치명:**
```
feat/<NN>-<subject>        # 기본값
fix/<NN>-<subject>         # 버그 수정이 명확할 때만
```

- `<NN>`: Notion unique_id 숫자 (prefix 없음). 예: `86`
- `<subject>`: 태스크명에서 자동 생성 (slugified, 영문 소문자-하이픈)

예: `feat/86-env-scaffolding`, `feat/87-corpus-recon`

**worktree 주차장은 `~/prv/.wt/<NN>-<subject>`** — repo sibling이 아닌 중앙 주차장.
디렉터리명이 체인 전체의 single source of truth다 (worktree명 = orch id = tmux 세션명).
repo prefix를 붙이지 않는다 — 브랜치 suffix 그대로.

```bash
NN="86"; SUBJECT="env-scaffolding"
WT="$HOME/prv/.wt/${NN}-${SUBJECT}"
BRANCH="feat/${NN}-${SUBJECT}"

git worktree add -b "$BRANCH" "$WT" main
```

**현재 repo에서 `git checkout`하지 않는다.** 다른 세션이 같은 repo에서 작업 중일 수 있고,
ralph-loop은 worktree 안에서 헤드리스로 돈다.

**Python 환경:** worktree에 `.python-version`이 git tracked면 pyenv가 자동 처리한다.
venv 방식이면 `ln -s <main-repo>/venv "$WT/venv"`.
`.env`는 gitignore 대상이므로 `ln -s <main-repo>/.env "$WT/.env"`로 심볼릭 링크.

**Description 생성 로직:**
```bash
# 한글이면 영문으로 자동 변환 (사용자 입력 금지 — Phase A는 무인)
# 영문이면 slugify
echo "Add Dark Mode Feature" | \
  tr '[:upper:]' '[:lower:]' | \
  tr ' ' '-' | \
  sed 's/[^a-z0-9-]//g'
# 결과: add-dark-mode-feature
```

**질문 없이 진행한다.** 브랜치명 확인을 받지 않는다 — 규칙이 결정론적이라 확인할 여지가 없다.

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
| 그 외 | `kimwoz` | $PLAB_GH_ORG 업무 |

**Step 1: Remote 존재 여부 확인**
```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
```

**Step 2: Remote가 없는 경우 → 질문 없이 private 저장소 생성**

포트폴리오 레포라도 초기 시행착오가 이력에 남지 않도록 **private이 기본값**이다.
public 전환은 eval 수치가 나온 뒤 사람이 판단한다.

**Step 3: GitHub 저장소 생성 (private 고정)**

저장소 이름은 현재 디렉토리 이름에서 추출:
```bash
REPO_NAME=$(basename "$PWD")
GH_USER=$(gh api user -q '.login')
```

```bash
gh repo create "$REPO_NAME" --private --source=. --remote=origin
```

**주의:** `gh repo create --source=.`는 remote를 설정하지만 push는 하지 않음. push는 worktree/checkout 단계 이후에 수행.

**Step 4: Remote URL 확인**
```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
REPO_URL=$(echo "$REMOTE_URL" | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
echo "Repo URL: $REPO_URL"
```

### 5. Notion 페이지 상태 업데이트

이 단계에서 `상태`·`작업일.start`·`Git 저장소`·**`Git 브랜치`**를 설정합니다.
브랜치 URL은 push 전에도 조립 가능하므로 착수 시점에 채웁니다 (컬럼을 비워두지 않는다).
`PR` URL만 PR 생성 직후에 설정합니다.

**Case A: Remote가 있는 경우**
```bash
NOTION_API_KEY=$(grep 'export NOTION_API_KEY' ~/.zshenv | head -1 | sed 's/export NOTION_API_KEY=//' | tr -d '"' | tr -d "'" | xargs)
REPO_URL=$(git remote get-url origin 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
BRANCH=$(git -C "$WT" branch --show-current)
BRANCH_URL="${REPO_URL}/tree/${BRANCH}"

TODAY=$(date +%Y-%m-%d)

curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_UUID" \
  -H "Authorization: Bearer $NOTION_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "properties": {
      "상태": { "select": { "name": "진행 중" } },
      "작업일": { "date": { "start": "'$TODAY'" } },
      "Git 저장소": { "url": "'$REPO_URL'" },
      "Git 브랜치": { "url": "'$BRANCH_URL'" }
    }
  }'
```

**Case B: Remote 생성이 실패한 경우 (네트워크·권한 오류)**
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
| Git 브랜치 | setup-work (여기) | URL은 push 전에도 조립 가능 — 비워두지 않는다 |
| PR | PR 생성 직후 (ralph-loop) | PR 생성 후에야 URL 존재 |
| 작업일 (종료일) | PR merge 후 | merge 시점이 실제 완료일 |
| 상태 → 완료 | PR merge 후 | merge되어야 작업 완료 |

### 6. 결과 저장

`docs/plans/<NN>-MMDD-work-info-<short-topic>.md` 생성:

```markdown
# Work Environment - {날짜}

## Notion Task
- **ID**: #{number}
- **URL**: {notion_url}
- **프로젝트**: {project_name}

## Git Branch
- **Name**: {branch_name}
- **Base**: main
- **Worktree**: ~/prv/.wt/{NN}-{subject}

## Related Files
- Design: docs/plans/<NN>-MMDD-design-<short-topic>.md
```

### 7. 완료 메시지

```
작업 환경이 준비되었습니다:
- Notion: #{number} ({notion_url})
- Branch: {branch_name}

이어서 `superpowers:writing-plans`로 plan을 작성한다 (질문 없이 진행).
plan에는 **통과 기준 · 이번에 안 하는 것 · 실패 징후** 3줄이 반드시 들어간다
(`rules/portfolio-judgment.md`) — Kickoff 게이트의 승인 대상이다.
```

## Note: PR 생성 시 vs PR Merge 시

### PR 생성 시 (ralph-loop이 수행)

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
