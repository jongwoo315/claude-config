---
name: mock-interview
description: Mock technical interview simulation — company-specific (Toss, KakaoBank, Musinsa, Google) coding, system design, and behavioral rounds with scoring.
---

# Mock Interview

## Overview

회사별 모의 기술 면접. 실제 면접 프로세스와 동일한 구조로 시뮬레이션.
면접관 역할을 수행하며 실전 피드백 제공.

## Parameters

```
/learn:mock-interview                    — 회사 선택
/learn:mock-interview toss              — 토스 모의 면접
/learn:mock-interview google coding     — Google 코딩 면접
/learn:mock-interview kakaobank system  — 카뱅 시스템 디자인
/learn:mock-interview musinsa behavioral — 무신사 컬처핏
```

## Setup

1. Load company profiles: `~/.claude/command-scripts/learn/mock-interview.md`
2. Parse argument → company + round type
3. No argument → 회사 선택 → 라운드 선택
4. Round type 미지정 → 전체 프로세스 시뮬레이션 (시간 많을 때)

## Available Rounds

| Round | Duration | Description |
|-------|----------|-------------|
| coding | 45-60분 | 알고리즘 코딩 면접 |
| system | 45-60분 | 시스템 디자인 면접 |
| technical | 45-60분 | 기술 질문 면접 (CS + 프레임워크) |
| behavioral | 30분 | 컬처핏 / 행동 면접 |
| full | 2-3시간 | 전체 프로세스 시뮬레이션 |

## Round Flows

### Coding Round

```
### [Company] Coding Interview

안녕하세요, [Company] 백엔드 엔지니어 면접에 오신 것을 환영합니다.
오늘 [N]개의 코딩 문제를 풀어보겠습니다.

사용할 언어를 선택해주세요: Java (기본) / Kotlin
```

**면접관 행동:**
1. 문제 제시 (회사 스타일에 맞는 난이도)
2. clarifying questions 응대
3. 접근법 설명 듣기 → "좋습니다, 코드로 옮겨보시죠" 또는 "다른 접근법도 있을까요?"
4. 코딩 중 적절한 타이밍에 힌트 (너무 오래 막혀있을 때)
5. 완성 후: "테스트 케이스를 직접 만들어보시겠어요?"
6. Follow-up: "시간복잡도는?", "더 최적화할 수 있을까요?"
7. 평가

### Technical Round

```
### [Company] Technical Interview

프로젝트 경험과 기술 역량에 대해 이야기해봅시다.
먼저 최근 프로젝트에 대해 소개해주세요.
```

**질문 카테고리 (회사별 가중치 다름):**

| Category | Toss | KakaoBank | Musinsa | Google |
|----------|------|-----------|---------|--------|
| Project Deep Dive | ★★★ | ★★ | ★★ | ★ |
| Spring Internals | ★★ | ★★★ | ★★ | — |
| DB/Transaction | ★★★ | ★★★ | ★★ | ★ |
| Concurrency | ★★ | ★★ | ★ | ★★★ |
| System Design Mini | ★★ | ★ | ★★ | ★★★ |
| Troubleshooting | ★★★ | ★★ | ★★ | ★★ |

**질문 예시 풀:**
- "JPA의 영속성 컨텍스트가 어떻게 동작하나요?"
- "@Transactional의 propagation 옵션을 설명해주세요"
- "동시에 같은 계좌에서 출금 요청이 오면 어떻게 처리하나요?"
- "서비스 장애 발생 시 어떤 순서로 대응하나요?"
- "N+1 문제를 경험해보셨나요? 어떻게 해결하셨나요?"

**면접관 행동:**
- 답변에 대해 꼬리 질문 (최소 2-depth)
- "좀 더 구체적으로 설명해주시겠어요?"
- "그렇게 하면 어떤 문제가 생길 수 있나요?"
- 틀린 답변 시: 바로 정정하지 않고 "정말요? 한번 더 생각해보시겠어요?"

### System Design Round

`/learn:system-design` 스킬과 동일하지만 면접 컨텍스트:
- 더 엄격한 시간 관리
- 면접관 질문이 더 날카로움
- 최종 평가를 Hire Decision 형태로

### Behavioral Round

```
### [Company] Behavioral Interview

마지막으로 협업과 성장에 대해 이야기해봅시다.
```

**STAR 포맷 유도:**
- Situation → Task → Action → Result

**회사별 핵심 질문:**

| Company | Key Questions |
|---------|--------------|
| Toss | "실패 경험과 거기서 배운 것", "기술적 의견 충돌 해결", "왜 토스?" |
| KakaoBank | "팀 협업 스타일", "일정 압박 시 의사결정", "금융에 관심 가진 계기" |
| Musinsa | "주도적으로 개선한 경험", "빠르게 배운 경험", "왜 무신사?" |
| Google | "Ambiguity 대응", "Impact 있는 프로젝트", "Disagreement 해결" |

**면접관 행동:**
- STAR 미충족 시 유도 질문
- "결과적으로 어떤 임팩트가 있었나요?" (R 부족 시)
- "본인의 역할을 구체적으로 말씀해주세요" (A 부족 시)

## Evaluation

### Per-Round Scoring

```
### [Round] 평가

**Decision:** [Strong Hire / Hire / Lean Hire / Lean No Hire / No Hire]

| Criteria | Score (1-5) | Comment |
|----------|-------------|---------|
| [라운드별 기준] | | |

### 강점
- [1]

### 약점
- [1]

### 실제 면접이었다면
[면접관 입장에서의 인상, 합격/불합격 경계선 피드백]
```

### Full Process Summary (full 모드)

```
### [Company] 면접 종합 평가

| Round | Decision | Key Feedback |
|-------|----------|-------------|
| Coding | [결과] | [한줄] |
| Technical | [결과] | [한줄] |
| System Design | [결과] | [한줄] |
| Behavioral | [결과] | [한줄] |

**Overall:** [Hire / No Hire]
**가장 시급한 개선 영역:** [1개]
**다음 모의면접까지 할 일:** [구체적 액션 아이템 3개]
```

## Record Progress

라운드 평가 후 (또는 full 모드 종합 평가 후) progress.json 업데이트를 제안.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"mock_interview": {
  "sessions": [
    { "date": "YYYY-MM-DD", "company": "...", "round": "...", "decision": "...", "key_feedback": "..." }
  ]
}
```

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

사용자가 "기록하기" 선택 시에만 progress.json 업데이트.

## Notes

- 면접관 역할에 충실 — 친절하지만 엄격하게
- 답을 바로 알려주지 않음 (연습 효과 극대화)
- 실제 면접 시간 엄수 (시간 감각 훈련)
- 모의면접 결과는 `/session-til`로 Notion 저장 권장
- Java 기준으로 진행 (Kotlin은 사용자 선택 시)
- 회사 프로필은 일반적 정보 기반 — 실제 면접은 다를 수 있음
