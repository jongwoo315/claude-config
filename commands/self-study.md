---
name: self-study
description: Use when jw wants to self-teach any topic (technical or not) using AI as a five-role learning system — advisor, librarian, tutor, editor, roommate. Triggers on bare Korean phrasing like "<주제> 독학 시작" / "<주제> 공부 시작", or when resuming an existing `~/prv/self-study/<topic>/notes.md` session. Not for studying an existing repo's design (that's `study`) — this is building curriculum and understanding from scratch on a brand-new topic.
---

# Self-Study (ALTER)

## Overview

한 번 쓰고 버리는 프롬프트가 아니라 **세션 간 이어지는 학습 루프**다. AI에게 다섯 역할을
번갈아 맡긴다 — Advisor(조언자) / Librarian(사서) / Tutor(튜터) / Editor(에디터) /
Roommate(룸메이트). 각 글자를 따서 ALTER.

핵심 문제의식: 역할극 프롬프트는 대화가 끝나면 휘발된다. 그래서 Advisor 단계 산출물
(커리큘럼)을 `notes.md`에 **고정**시키고, 매 세션 그 파일부터 읽어 이어간다.

## 발동 조건

- bare alias: `"<주제> 독학 시작"`, `"<주제> 공부 시작"` 같은 자연어
- 이미 `~/prv/self-study/<topic-slug>/notes.md`가 있으면 자동으로 이어서(resume) —
  새로 킥오프하지 않는다

## Workspace

`~/prv/self-study/<topic-slug>/notes.md`

`topic-slug`: 주제를 소문자-하이픈으로 (예: "주택정책 독학 시작" → `주택정책` 그대로 써도
됨, 영문 주제면 하이픈 변환).

## notes.md 포맷

```markdown
# <주제> 독학

**Status:** advisor-pending | in-progress | done
**Last session:** YYYY-MM-DD

## Advisor 산출물 (고정 — 바뀌려면 명시적 재협상 필요)
- 목적지:
- 기준선:
- 순서:
- 뺄 것:
- 주간 마일스톤:

## Librarian — 선정 자료 (3~4개, 선정 이유 포함)
- ...

## 진행 로그
- [ ] Week 1: ...

## Roommate 메모 (가끔, 선택)
- ...
```

## Session Contract — 5 roles

### Advisor (킥오프, 최초 1회만)

5개 결정을 **한 번에 하나씩** 물어본다 (몰아서 묻지 않는다):
1. 목적지 — 다 배우면 뭘 할 수 있어야 하나
2. 기준선 — 지금 아는 정도
3. 순서 — 어떤 순서로 배울지
4. 뺄 것 — 지금은 무시해도 되는 것
5. 주간 마일스톤 — 뭘 만들어야 다음 단계로 넘어갈 준비된 건지

다 모이면 `notes.md`의 "Advisor 산출물"에 기록하고 **고정**한다. 이후 바뀌려면 jw가
명시적으로 재협상을 요청해야 한다 — 세션 분위기 따라 슬쩍 바뀌면 안 된다.

### Librarian (자료 선정, 킥오프 직후 1회 + 자료 고갈 시 재실행)

핵심 자료 3~4개를 추려서 이유와 함께 제시한다 (책/강의/논문/영상 등). 뭘 찾아야 할지
불확실하면 딥리서치용 프롬프트를 먼저 제안한다.

NotebookLM 같은 도구에 업로드하는 건 **jw가 수동으로 한다** — API로 대신 못 함.

### Tutor (진행 중 세션의 기본 루프)

한 번에 질문 하나. 강의하지 않는다 — jw의 이해 구멍을 찾는 게 목적.

**규율은 `study` 스킬의 원칙을 그대로 가져온다:** 이해는 jw 자신의 답변으로만 전진한다.
답을 먼저 보여주지 않는다. jw가 답한 뒤 뭐가 맞고 뭐가 빠졌는지 알려준다.

### Editor (산출물이 있을 때)

jw가 만든 결과물(글/코드/기획)을 리뷰한다 — 논리 허점, 구조, 반복 지적. 대신 써주지
않는다 (`rules/learning.md`와 같은 경계 — Tutor/Editor는 힌트와 피드백까지, 완성본을
채워주지 않는다).

### Roommate (선택, 가끔)

매 세션 아님. 가끔 완전히 다른 분야 렌즈로 질문 하나 끼워넣는다. `notes.md`의 "Roommate
메모"에 남긴다.

## Session Flow (킥오프 이후 매 세션)

1. `notes.md` 읽고 resume — 어디까지 했는지 파악
2. 오늘 뭘 할지 확인: Tutor 점검 / Editor 리뷰 / 새 자료 필요(Librarian) / 가끔 Roommate
3. 해당 역할 실행
4. `notes.md` 진행 로그에 기록
5. 짧게 wrap up: 오늘 뭐 했는지, 다음에 뭘 할지

## Done 기준 (마일스톤 단위)

`commands/learn/_guide-common.md`의 generic 4축 재사용:
1. 산출물 존재 — 그 마일스톤이 요구한 결과물이 실제로 있다
2. 검증 가능 — 실행/재현/설명 가능한 형태
3. 관찰 산출물 — `notes.md`에 최소 1개 기록
4. 다음 마일스톤 전제 충족

## 코딩 아닌 주제 처리

주제가 코드가 아니어도(재무·디자인·정책 등) 원칙은 같다 — **AI가 결과물을 대신 만들지
않는다.** Editor는 jw가 쓴 글/정리를 다듬어주는 역할이지, 처음부터 써주는 역할이 아니다.

## Integration

- `study`와 다름: `study`는 **이미 있는 repo**의 WHY를 파헤치는 것(읽기 전용). 이건 **새
  주제를 처음부터** 커리큘럼 짜서 쌓는 것.
- Tutor 단계 규율은 `study` 스킬의 "이해는 본인 답변으로만 전진한다" 원칙을 그대로 씀.

## Notes

- 5단계를 매 세션 다 돌 필요 없다 — Tutor/Editor가 메인 루프, Librarian은 자료 고갈 시,
  Roommate는 옵션.
- Advisor 산출물이 안 정해졌는데 Tutor/Editor 단계로 넘어가지 않는다 — 킥오프 먼저.
