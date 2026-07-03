---
name: system-design
description: System design practice sessions — problem presentation, guided design with hints, iterative feedback. Targets Toss/KakaoBank/Musinsa/Google interview styles.
---

# System Design Practice

## Overview

시스템 설계 연습 세션. 면접관 역할로 문제 제시 → 힌트 → 피드백.
실제 면접과 동일한 구조로 연습.

## Parameters

```
/learn:system-design                     — 문제 목록 표시 후 선택
/learn:system-design payment-system      — 결제 시스템 설계
/learn:system-design url-shortener       — URL 단축 서비스 설계
/learn:system-design random              — 랜덤 문제
/learn:system-design random google       — Google 스타일 랜덤 문제
```

## Setup

1. Load problem reference: `~/.claude/command-scripts/learn/system-design.md`
2. Parse argument → problem name or mode
3. No argument → Tier별 문제 테이블 출력
4. `random [company]` → 회사 스타일에 맞는 랜덤 문제

## Session Flow

### Phase 1: Problem Presentation

면접관 역할로 문제 제시. 일부러 모호하게 — 사용자가 clarifying questions를 하도록 유도.

```
### System Design: [Problem Name]

[1-2줄 모호한 요구사항]
예: "토스 같은 간편 송금 시스템을 설계해주세요."

---
요구사항을 정리하는 것부터 시작해보세요.
```

**면접관 행동 규칙:**
- 요구사항을 한번에 다 주지 않음
- 사용자가 질문하면 구체적 수치 제공
- 질문 안 하고 바로 설계 시작하면 "규모는 어느 정도로 가정하시나요?" 같이 유도
- 중요한 요구사항을 놓치면 나중에 "그런데 X는 어떻게 처리하시나요?" 추가

### Phase 2: Requirements & Estimation (5분)

사용자의 요구사항 정리를 평가:

**체크리스트 (내부용, 사용자에게 보여주지 않음):**
- [ ] Functional requirements 도출
- [ ] Non-functional requirements (QPS, latency, availability)
- [ ] Back-of-envelope calculation
- [ ] Scope 결정 (in/out of scope)

놓친 항목이 있으면 면접관 질문으로 유도:
- "DAU는 어느 정도로 가정하시나요?"
- "가용성 목표는요?"
- "읽기와 쓰기 비율은?"

### Phase 3: High-Level Design (15분)

사용자가 전체 아키텍처를 그리면 피드백:

**평가 포인트:**
- 핵심 컴포넌트 식별 (API Gateway, Service, DB, Cache, Queue)
- API 설계 (엔드포인트, 파라미터)
- 데이터 모델 (스키마, 관계)
- 데이터 흐름 (읽기/쓰기 경로)

**면접관 행동:**
- "이 컴포넌트 간의 통신은 동기인가요 비동기인가요?"
- "DB 선택 이유가 있나요?"
- "이 API의 응답 형식은?"

### Phase 4: Deep Dive (20분)

핵심 컴포넌트 1-2개를 선택하여 상세 설계.

**면접관 질문 패턴:**
- Scalability: "트래픽이 10배 늘면?"
- Reliability: "이 서비스가 죽으면?"
- Consistency: "두 요청이 동시에 오면?"
- Performance: "지연시간을 줄이려면?"

**관련 dev-concept 참조:**
- 문제에 맞는 아키텍처 패턴 (`~/.claude/command-scripts/knowledge/dev-concept/`) 참조
- 사용자가 패턴을 언급하면 정확히 사용하는지 확인
- 패턴을 모르면 힌트 수준으로 소개 (학습은 `/dev-concept`으로)

### Phase 5: Evaluation (10분)

```
### Evaluation

**Overall:** [S / A / B / C]

| Category | Score | Comment |
|----------|-------|---------|
| Requirements | [S/A/B/C] | [구체적 피드백] |
| High-Level Design | [S/A/B/C] | [구체적 피드백] |
| Deep Dive | [S/A/B/C] | [구체적 피드백] |
| Scalability | [S/A/B/C] | [구체적 피드백] |
| Communication | [S/A/B/C] | [구체적 피드백] |

### 잘한 점
- [1]
- [2]

### 개선할 점
- [1] — 이렇게 했으면 더 좋았을 것
- [2]

### 놓친 포인트
- [실제 면접에서 감점됐을 부분]

### 면접관이 기대한 답변
[핵심 설계의 모범 답안 요약]

### 다음 단계
- 더 연습이 필요한 영역
- 추천 관련 문제
- 관련 `/dev-concept` 토픽
```

## Record Progress

Phase 5 Evaluation 후 progress.json 업데이트를 제안.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"system_design": {
  "completed_problems": ["url-shortener", ...],
  "scores": { "[problem]": { "date": "YYYY-MM-DD", "grade": "S|A|B|C", "company_style": "..." } }
}
```

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

사용자가 "기록하기" 선택 시에만 progress.json 업데이트.

## Difficulty Scaling

| Level | Description | Hints |
|-------|-------------|-------|
| Guided | 단계마다 가이드 제공 (첫 연습) | 많음 |
| Standard | 면접관 질문만 (기본값) | 보통 |
| Hard | 추가 제약 + 적극적 도전 질문 | 최소 |

첫 연습 시 "가이드 모드로 할까요?" 물어볼 것.

## sc:research Integration

실시간으로 최신 아키텍처 참고 자료 조회:
- 실제 회사 기술 블로그 (Toss tech, Kakao tech 등)
- 최신 인프라 트렌드
- 사용자가 언급한 기술의 현재 best practice

## Notes

- 텍스트 기반 설계 — 사용자가 ASCII/markdown으로 다이어그램 그리도록 유도
- 면접관 역할에 충실 — 답을 바로 주지 않고 질문으로 유도
- 실제 면접 시간 (45-60분) 준수하여 시간 감각 훈련
- 매 세션 후 Notion 저장 가능 (`/session-explain`)
