---
name: ticket-breakdown
description: Use when creating 2 or more tickets at once — an epic (프로젝트/에픽) with child tickets, 티켓 대량 생성, 태스크 나열·생성, even from a plain request like "디비 구조에 맞게 태스크 생성해". Splits work walking-skeleton first, gets one approval on the ticket list, then creates them in Notion (프로젝트 진행 DB) or Jira (Epic + children).
---

# Ticket Breakdown — 에픽 + 하위 티켓 한 번에 만들기

티켓 하나만 만들 때는 이 스킬이 아니라 `personal-create-task`(Notion) · `setup-work`(Jira)를 쓴다.

**왜 있나.** upgrade-impact-rag·cheongyak-rag 티켓 51개를 아래 단계부터 쌓았다(파싱 → 청킹 → 검색).
질문을 넣어 답이 나오는 흐름이 끝까지 한 번도 돈 적이 없어서, 티켓을 처리하는 동안 지금 무엇을
하는지 감이 안 잡혔다. upgrade-impact-rag #97은 첫 실제 repo 실행에서야 `impacted 0`이 드러났다.
게다가 그 51개는 평문 요청 + `curl`로 만들어졌고 스킬은 한 번도 불리지 않았다 — 전역 `CLAUDE.md`
§개발 작업이 이 스킬을 가리키는 이유다.

참고: Notion 「walking skeleton + TDD」 페이지
`https://app.notion.com/p/jongwoo315/walking-skeleton-TDD-40041e6165c081049baddc7ad4623f32`

## 1. 티켓 나누기 — walking skeleton 먼저

**첫 티켓은 skeleton이다.**

- 모든 단계를 stub으로 둔다. 입력부터 최종 출력까지 이어지기만 하면 된다
- LLM 자리는 고정값을 돌려주는 stub이다
- 끝까지 도는 테스트를 1개 둔다. 품질은 보지 않고 끝까지 도는지만 본다
  - RAG 예: 질문 하나 → 판정값 + 실제로 있는 조문 인용

**나머지 티켓 제목은 「어느 stub을 실제 구현으로 바꾸나」로 쓴다.**

```
✗ #2 PDF 파서 구현 / #3 청킹 / #4 검색
✓ #2 파싱 stub을 실제 PDF 파서로 바꾼다 / #3 검색 stub을 BM25로 바꾼다
```

- 단계 하나만 깊게 파는 티켓보다, 끝까지 도는 흐름을 유지한 채 stub 하나를 바꾸는 티켓이 낫다
- LLM stub을 실제 LLM으로 바꾼 뒤에는 eval 점수를 보며 한 단계씩 고친다. 그 티켓의 통과 기준은
  plan에 세 구간으로 적는다(`rules/before-work.md` §실패 징후가 수치면 임계값을 못 박는다)

**skeleton 티켓이 끝나면 나머지 티켓의 순서와 범위를 다시 본다.** skeleton 리포트에서 가장 문제가
큰 stub을 다음 티켓으로 당기고, 필요 없어진 티켓은 지우거나 범위를 줄인다. 처음 정한 순서는
skeleton을 돌려 보기 전의 추측이다 — 그대로 두면 틀린 것을 늦게 안다(upgrade-impact-rag #97).

**skeleton을 쓰지 않는 경우** — 목록 맨 위에 이유를 한 줄 적고 그냥 나눈다.

- 가능성을 보는 단계다(되는지 모른다) → spike 티켓 하나로 먼저 확인한다
- 단계가 하나뿐인 작업이다

## 2. 확인 — 한 번만

티켓 목록을 표로 보여 주고 jw 승인을 받는다. 고치라고 하면 고쳐서 다시 보여 준다.

| 순서 | 제목 | 선행 작업 | Story Points (Jira만) |
| --- | --- | --- | --- |
| 1 | skeleton: 질문을 넣으면 판정 + 인용까지 끝까지 나온다 | — | 3 |
| 2 | 검색 stub을 BM25로 바꾼다 | 1 | 2 |

- 에픽 이름도 같이 보여 준다(Notion은 `프로젝트` select 값, Jira는 Epic 제목 또는 기존 Epic 키)
- 승인 전에는 아무것도 만들지 않는다

## 3. 생성 — Notion (`~/prv`)

에픽 = `프로젝트` select 값. 새 이름이면 페이지를 만들 때 옵션이 자동으로 생긴다.

- 페이지 하나 만드는 방법(속성 표, payload, 서식)은 `personal-create-task` §4를 따른다. 여기 베끼지 않는다
- 기존 프로젝트 이름 조회는 `personal-create-task` §2를 따른다(data source API)
- 순서대로 만들고, 만들 때마다 응답의 `id`를 기록한다
- 다 만든 뒤 `선행 작업` relation을 건다. `후속 작업`은 Notion이 반대쪽을 자동으로 채운다

```bash
# 선행 작업 걸기 — PAGE_ID가 PREV_ID를 선행으로 갖는다
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_API_KEY" -H "Content-Type: application/json" \
  -H "Notion-Version: 2022-06-28" \
  --data-binary @<(python3 -c "import json;print(json.dumps({'properties':{'선행 작업':{'relation':[{'id':'$PREV_ID'}]}}}))")
```

- 선행이 둘 이상이면 relation 배열에 같이 넣는다. 덮어쓰기라서 나눠 보내면 앞의 것이 지워진다

## 4. 생성 — Jira (회사)

에픽 = 실제 Epic 이슈.

1. 기존 Epic 키를 받았으면 그것을 쓴다. 없으면 issuetype `Epic`으로 먼저 만든다
2. 하위 티켓은 `fields.parent.key`에 Epic 키를 넣는다
3. `setup-work`의 6개 필드(Project · Issue Type · Parent · Labels · Priority · Story Points)는
   **공통값을 한 번만** 묻는다. Story Points는 위 목록 표에서 티켓마다 받는다
4. 필드 ID, Story Points 두 필드, Start Date는 `setup-work` §Jira API Implementation을 따른다
5. assignee는 `rules/apis.md` §이슈 생성 — `myself`로 조회한 accountId를 넣는다. 만든 뒤 비어 있지 않은지 본다
6. 선행 관계는 `Blocks` link로 건다 (2026-10-21 link type 목록에서 확인)

```bash
# A가 B를 막는다(A가 선행) — outwardIssue가 blocks, inwardIssue가 is blocked by
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -u "$PLAB_WORK_EMAIL:$JIRA_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"type":{"name":"Blocks"},"outwardIssue":{"key":"'"$A"'"},"inwardIssue":{"key":"'"$B"'"}}' \
  "https://$PLAB_JIRA_HOST/rest/api/3/issueLink"   # 201이면 성공
```

- 회사 repo에는 `docs/plans/`를 커밋하지 않는다(`rules/github.md` §회사 repo에 커밋하지 않는 것)

## 5. 결과

| ID | 제목 | 선행 | URL |
| --- | --- | --- | --- |

- 표 아래에 에픽 이름(또는 Epic 키)을 적는다
- 각 티켓은 지금처럼 `dev-workflow`로 착수한다. A2가 이미 있는 티켓을 재사용한다
- 실패한 티켓이 있으면 표에 남기고 이유를 적는다. 다시 만들지 말고 jw에게 보고한다 — 중복 생성이 더 치우기 어렵다
