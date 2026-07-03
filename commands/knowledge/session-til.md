---
name: session-til
description: Use when ending a session to capture senior engineering perspectives, architectural decisions, tradeoff analyses, and concept explanations into Notion Dev Scraps database
---

# Session TIL - Save Session Insights to Notion

## Overview

현재 세션에서의 시니어 엔지니어링 관점 — 아키텍처 결정, 트레이드오프 분석, 비즈니스 판단 등 — 을 분석하여 Notion Dev Scraps 데이터베이스에 일별 페이지로 저장합니다.

AI가 대체할 수 없는 **의사결정 과정과 근거**를 기록하는 것이 핵심입니다.

**Database:** Dev Scraps
**Database ID:** `76e9673e-d91b-41b2-9779-c0940040f542`
**API Key:** `NOTION_API_KEY`

**Properties Mapping:**
| Dev Scraps Property | Value |
|---------------------|-------|
| 제목 | `YYYY-MM-DD TIL` |
| 주제 | `Session TIL` |
| 카테고리 | `✍️ In Action` |
| 작성일 | 오늘 날짜 |

## Usage

```
/session-til              → 자동 판단 (내용 보고 포맷 결정)
/session-til gotcha       → Before/After/So What 강제
/session-til decision     → 상황/선택/근거 강제
/session-til explain      → 개념 설명 원본 보존 강제
```

## Prerequisites

- `NOTION_API_KEY` 환경변수 설정

## Categories (7개)

페이지 본문의 heading_2 섹션으로 사용됩니다.

| 카테고리 | 포함 내용 | 예시 |
|----------|-----------|------|
| Architecture Decision | 구조/설계 선택과 근거 | "모놀리스 내 모듈 분리 vs 서비스 분리" |
| Tradeoff Analysis | A vs B 비교 분석과 선택 이유 | "캐시 vs 직접조회: 성능 vs 일관성" |
| Business Context | 기술 결정의 비즈니스 맥락 | "매출 영향 고려한 점진적 마이그레이션" |
| Risk/Incident Judgment | 리스크 판단, 장애 대응 전략 | "배포 롤백 기준, 장애 영향 범위 판단" |
| Code Review Insight | 리뷰에서 발견한 패턴/안티패턴 | "N+1 쿼리 놓친 이유와 방지 패턴" |
| Technical Debt | 기술 부채 판단 (갚을지/둘지) | "레거시 API 호환성 유지 vs 제거" |
| System Understanding | 시스템 동작에 대한 깊은 이해 | "Django ORM select_for_update 락 범위" |

## Process

### 1. 세션 대화 분석

현재 세션의 대화 내역을 분석하여 **시니어 관점의 인사이트**를 추출합니다.

**포맷 결정:**
- 인자가 있으면 (`gotcha` / `decision` / `explain`) → 해당 포맷 강제 적용
- 인자가 없으면 → 내용을 보고 자동 판단

**추출 기준:**
- 아키텍처나 설계에서 선택을 한 경우 (왜 이 구조인가)
- 두 가지 이상 대안을 비교하고 하나를 선택한 경우
- 비즈니스 맥락이 기술 결정에 영향을 준 경우
- 리스크를 평가하고 대응 방향을 결정한 경우
- 코드 리뷰에서 의미 있는 패턴이나 안티패턴을 발견한 경우
- 기술 부채를 인지하고 처리 방향을 판단한 경우
- 시스템의 비직관적 동작이나 깊은 메커니즘을 이해한 경우
- **잘못 알고 있던 것이 교정된 경우** (갓챠, 예상과 다른 동작, Before→After 전환)
- **개념/아키텍처/기술을 깊이 설명한 경우** (상세 설명, 비교 분석, 튜토리얼 포함)

**추출하지 않는 것:**
- 단순 명령어 사용 (AI가 쉽게 알려줄 수 있는 것)
- 기본적인 에러 해결 (구글링으로 찾을 수 있는 것)
- 도구의 기본 사용법

**항목 형식 — 세 가지 모드:**

내용의 성격에 따라 자동 판단:

1. 의사결정 (상황/선택/근거):
```
제목: <핵심 의사결정 한 줄 요약>
- 상황: <어떤 맥락에서 이 결정이 필요했는가>
- 선택: <무엇을 선택했는가 (대안이 있었다면 대안도)>
- 근거: <왜 이 선택이 맞는가, 트레이드오프는 무엇인가>
```

2. 갓챠/교정 (Before/After/So What):
```
제목: <교정된 이해 한 줄 요약>
- Before: <잘못 알고 있던 것 또는 가정>
- After: <실제 동작/사실>
- So What: <앞으로 어떻게 적용할 것인가>
```

3. 개념 설명 (원본 보존):
```
제목: <개념 한 줄 요약>
내용: 세션에서 생성된 설명 원본을 마크다운 그대로 보존
     (Notion 블록으로 변환하여 toggle 내부에 저장)
```

**코드 블록 추가 규칙:**
- 이해를 돕는 코드 예시가 세션에 있었거나 만들 수 있으면 → toggle 내부에 `code` 블록으로 추가 (생략 금지)
- 언어 비교(Java vs Python 등)가 있으면 → 언어별로 별도 `code` 블록으로 분리
- Notion code block 허용 언어: `java`, `python`, `kotlin`, `shell`, `sql`, `typescript`, `javascript`, `bash` 등 (주의: `"shell script"` 아님 → `"shell"`)

**테이블/비교표 추가 규칙:**
- 세션에 마크다운 테이블이 있었으면 → Notion `table` 블록으로 변환하여 적극 추가 (생략 금지)
- Notion table 블록 구조:
```json
{
  "object": "block", "type": "table",
  "table": {
    "table_width": <column_count>,
    "has_column_header": true,
    "has_row_header": false,
    "children": [
      {
        "object": "block", "type": "table_row",
        "table_row": {
          "cells": [
            [{"type": "text", "text": {"content": "<헤더1"}}],
            [{"type": "text", "text": {"content": "<헤더2>"}}]
          ]
        }
      },
      {
        "object": "block", "type": "table_row",
        "table_row": {
          "cells": [
            [{"type": "text", "text": {"content": "<값1>"}}],
            [{"type": "text", "text": {"content": "<값2>"}}]
          ]
        }
      }
    ]
  }
}
```

### 2. 사용자 확인

추출한 항목을 카테고리별로 표시합니다.

```
세션에서 추출한 인사이트:

## Architecture Decision
- **Celery task에서 직접 DB 조회 vs 캐시 사용**
  - 상황: 매치 취소 시 실시간 슬랙 알림이 필요한 상황
  - 선택: 직접 DB 조회 (캐시 무효화 복잡도 > 쿼리 비용)
  - 근거: 취소는 저빈도 이벤트, 캐시 일관성 리스크가 더 큼

## Tradeoff Analysis
- **마이그레이션 방식: Big Bang vs Strangler Fig**
  - 상황: 레거시 결제 모듈을 새 구조로 전환
  - 선택: Strangler Fig (점진적 전환)
  - 근거: 매출 직결 기능이라 무중단 전환 필수, 롤백 가능성 확보

수정할 항목이 있으면 알려주세요. 없으면 Notion에 저장합니다.
```

**AskUserQuestion으로 확인:**
- 항목 수정/제거/추가 여부
- 확인 후 저장 진행

### 3. 오늘 날짜 페이지 조회

```bash
source ~/.zshenv
notion_key=$(printenv NOTION_API_KEY)
DB_ID="76e9673e-d91b-41b2-9779-c0940040f542"
TODAY=$(date +%Y-%m-%d)

curl -s -X POST "https://api.notion.com/v1/databases/$DB_ID/query" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d "{
    \"filter\": {
      \"and\": [
        { \"property\": \"주제\", \"select\": { \"equals\": \"Session TIL\" } },
        { \"property\": \"작성일\", \"date\": { \"equals\": \"$TODAY\" } }
      ]
    }
  }"
```

- 결과가 있으면 → Step 4a (기존 페이지에 추가)
- 결과가 없으면 → Step 4b (새 페이지 생성)

### 4a. 기존 페이지에 추가

**4a-1. 기존 블록 읽기 (중복 확인용)**

```bash
PAGE_ID="<existing_page_id>"

curl -s -X GET "https://api.notion.com/v1/blocks/$PAGE_ID/children?page_size=100" \
  -H "Authorization: Bearer $notion_key" \
  -H "Notion-Version: 2022-06-28"
```

블록이 100개 초과 시 `next_cursor`로 페이지네이션.

**4a-2. 중복 제거**

기존 블록에서 `toggle` 타입의 `rich_text`를 추출하여, **bold** 텍스트(제목)를 비교.
새로 추출한 항목 중 동일 제목이 이미 있으면 제거.

**4a-3. 새 항목 추가**

카테고리별로 기존 heading_2 블록 이후에 새 항목을 추가합니다.

새 카테고리가 필요한 경우:
```bash
curl -s -X PATCH "https://api.notion.com/v1/blocks/$PAGE_ID/children" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "children": [
      {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{ "text": { "content": "<CATEGORY_NAME>" } }]
        }
      },
      {
        "object": "block",
        "type": "toggle",
        "toggle": {
          "rich_text": [
            {
              "type": "text",
              "text": { "content": "Celery task에서 직접 DB 조회 vs 캐시 사용" },
              "annotations": { "bold": true }
            }
          ],
          "children": [
            {
              "object": "block",
              "type": "bulleted_list_item",
              "bulleted_list_item": {
                "rich_text": [
                  { "type": "text", "text": { "content": "상황: " }, "annotations": { "bold": true } },
                  { "type": "text", "text": { "content": "매치 취소 시 실시간 슬랙 알림이 필요한 상황" } }
                ]
              }
            },
            {
              "object": "block",
              "type": "bulleted_list_item",
              "bulleted_list_item": {
                "rich_text": [
                  { "type": "text", "text": { "content": "선택: " }, "annotations": { "bold": true } },
                  { "type": "text", "text": { "content": "직접 DB 조회 (캐시 무효화 복잡도 > 쿼리 비용)" } }
                ]
              }
            },
            {
              "object": "block",
              "type": "bulleted_list_item",
              "bulleted_list_item": {
                "rich_text": [
                  { "type": "text", "text": { "content": "근거: " }, "annotations": { "bold": true } },
                  { "type": "text", "text": { "content": "취소는 저빈도 이벤트, 캐시 일관성 리스크가 더 큼" } }
                ]
              }
            }
          ]
        }
      }
    ]
  }'
```

기존 카테고리에 항목만 추가하는 경우, 해당 카테고리의 마지막 블록 이후(페이지 끝 또는 다음 heading_2 이전)에 append합니다.

### 4b. 새 페이지 생성

```bash
TODAY=$(date +%Y-%m-%d)
DB_ID="76e9673e-d91b-41b2-9779-c0940040f542"

curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $notion_key" \
  -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  -d '{
    "parent": { "database_id": "'$DB_ID'" },
    "properties": {
      "제목": {
        "title": [{ "text": { "content": "'$TODAY' TIL" } }]
      },
      "작성일": {
        "date": { "start": "'$TODAY'" }
      },
      "주제": {
        "select": { "name": "Session TIL" }
      },
      "카테고리": {
        "select": { "name": "✍️ In Action" }
      }
    },
    "children": [
      <CATEGORY_SECTIONS_AND_ITEMS>
    ]
  }'
```

**children 블록 구조 (카테고리별):**

항목이 있는 카테고리만 포함. 각 카테고리:
```json
{
  "object": "block",
  "type": "heading_2",
  "heading_2": {
    "rich_text": [{ "text": { "content": "<CATEGORY>" } }]
  }
},
{
  "object": "block",
  "type": "toggle",
  "toggle": {
    "rich_text": [
      {
        "type": "text",
        "text": { "content": "<의사결정 제목>" },
        "annotations": { "bold": true }
      }
    ],
    "children": [
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [
            { "type": "text", "text": { "content": "상황: " }, "annotations": { "bold": true } },
            { "type": "text", "text": { "content": "<상황 설명>" } }
          ]
        }
      },
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [
            { "type": "text", "text": { "content": "선택: " }, "annotations": { "bold": true } },
            { "type": "text", "text": { "content": "<선택한 것과 대안>" } }
          ]
        }
      },
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [
            { "type": "text", "text": { "content": "근거: " }, "annotations": { "bold": true } },
            { "type": "text", "text": { "content": "<왜 이 선택인가>" } }
          ]
        }
      }
    ]
  }
}
```

### 5. 결과 출력

```
TIL이 Notion에 저장되었습니다:
- 날짜: {date}
- 페이지: {page_url}
- 추가된 인사이트: {new_count}개
- 중복 스킵: {skipped_count}개
```

### 6. TDR 연결 제안

저장 완료 후, 저장된 항목 중 `decision` 또는 `gotcha` 포맷이 있으면 AskUserQuestion으로 제안:

```
이 결정/발견을 면접용 TDR로 만들까요?
- 예 → /tdr (Session TIL 기반 모드로 바로 연결)
- 나중에
```

**"예" 선택 시:** `/tdr`을 Session TIL 기반 모드로 즉시 실행.
방금 저장한 페이지 ID와 toggle ID를 전달하여 Notion 재조회 없이 바로 사용.

## Pipeline

```
세션 중 인사이트 발견
    ↓
/session-til [gotcha|decision|explain]
    ↓ 저장 완료
"TDR로 만들까요?"
    ↓ 예
/tdr → Session TIL 기반 → Q&A로 깊게 파고들기
    ↓
면접용 포트폴리오 완성
```

## Trigger Suggestion

세션 중 다음 상황에서 TIL 저장을 제안:
- 사용자가 "오늘은 여기까지", "끝", "done" 등 세션 종료 의사 표현
- 세션에서 의미 있는 아키텍처/설계 결정이 있었던 경우
- 개념/아키텍처를 깊이 설명한 경우 ("이 설명 좋다", "이거 저장하고 싶다" 등)

제안 문구:
> "이 세션에서 기록할 인사이트가 있었습니다. TIL로 저장할까요? (`/session-til`)"

## Error Handling

| 상황 | 대응 |
|------|------|
| NOTION_API_KEY 없음 | `~/.zshenv`에서 설정 안내 |
| 권한 오류 | Integration이 Dev Scraps 페이지에 연결되어 있는지 확인 안내 |
| 추출 항목 0개 | "이 세션에서 기록할 시니어 관점의 인사이트가 없습니다" 표시 |
| 기존 페이지 블록 100개 초과 | `next_cursor`로 페이지네이션하여 전체 블록 읽기 |
| Notion API rich_text 2000자 제한 | 짧은 항목: 200자로 축약. 긴 설명: 문단/함수 단위로 분할하여 별도 블록으로 저장 |
| children 100개 초과 | 페이지 생성 후 나머지는 PATCH로 append |
