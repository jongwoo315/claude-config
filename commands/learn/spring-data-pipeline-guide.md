---
name: spring-data-pipeline-guide
description: Spring data pipeline guided learning — Spring Batch, Spring Kafka, messaging patterns. Triggers on Spring Batch, Kafka, data pipeline, ETL, or event-driven learning requests.
---

# Spring Data Pipeline Guide

## Overview

Spring Batch + Spring Kafka 개념별 가이드 학습. Django 경험자를 위한 브릿지 설명 포함.
각 토픽을 "Django에서는 X → Spring에서는 Y (또는 없음)" 구조로 학습.

## Parameters

```
/learn:spring-data-pipeline                    — 토픽 맵 표시 후 선택
/learn:spring-data-pipeline batch-basics       — Spring Batch Job/Step/Chunk 학습
/learn:spring-data-pipeline kafka-consumer     — Spring Kafka Consumer 학습
```

## Setup

1. Load topic reference: `~/.claude/command-scripts/learn/spring-data-pipeline-guide.md`
2. Parse argument → topic ID or name
3. No argument → prerequisite map + 토픽 테이블 출력
4. Prerequisite 확인 — 선수 토픽 미학습 시 경고 (강제는 아님)

## Session Flow

### Step 1: Django Bridge (5분)

```
## [Topic] — Spring Data Pipeline Guide

### Django에서는...
[Django/Celery에서 유사 문제를 어떻게 해결하는지, 또는 없다면 그 이유]
[코드 예시 포함]

### Spring에서는...
[Spring의 접근 방식이 다른 이유]
[철학적 차이: 재시작성, exactly-once, 파티션 등]
```

### Step 2: Core Concepts (10분)

핵심 개념을 **context7** MCP로 최신 문서 참조하여 설명.

설명 구조:
1. **What** — 이 기능이 무엇인가
2. **Why** — 왜 필요한가 (Django/Celery와 무엇이 다른가)
3. **How** — 어노테이션/설정/동작원리
4. **Gotcha** — 흔한 실수, 주의점

### Step 3: Live Code Exercise

사용자가 직접 코드를 작성하는 실습.

프로젝트에 실습 파일 준비:
```
learn-spring/src/main/java/com/example/[topic]/
├── [Job/Consumer/Producer 등].java  ← 시그니처 + TODO
└── README.md                        ← 요구사항
```

**실습 설계 원칙:**
- 5-10줄 분량의 핵심 로직만 사용자가 작성
- 보일러플레이트는 미리 세팅
- 의미 있는 설계 선택이 포함된 과제 (정답이 하나가 아닌 것)

### Step 4: Quiz (5분)

3-5개 확인 문제.

**퀴즈 생성 규칙 (필수):**
- **코드 스니펫 주석 금지**: 정답 암시 주석 제거
- **코드 자체가 정답 아니도록**: 개념 이해 없이 시각 패턴으로 풀리는 문제 제외
- **정답 위치 분산 필수**: a/b/c/d 각 1-2개씩. b/c 편중 금지

### Step 5: Portfolio Task

```
### 실전 과제

[토픽]을 포트폴리오 프로젝트에 적용하세요:

**Task:** [구체적 과제]
**File:** [생성/수정할 파일]
**Acceptance:** [완료 기준]
```

### Step 5.5: Record Progress

Quiz 완료 후 `progress.json` 업데이트.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"spring_data_pipeline": {
  "topics": {
    "[topic]": {
      "last_practiced": { "date": "YYYY-MM-DD", "attempts": N, "solved": N, "total": N }
    }
  },
  "session_log": [
    { "date": "YYYY-MM-DD", "topic": "...", "problems": [...], "solved": N, "total": N }
  ]
}
```

**누적 로직:**
- 기존 기록 있으면: `attempts += 1`, `solved/total` 누적, `date` 갱신
- 없으면: `attempts: 1`, 이번 세션 결과로 초기화

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

### Step 6: Wrap Up

```
### 정리

**오늘 배운 것:**
- [핵심 1]
- [핵심 2]

**Django ↔ Spring 매핑:**
| Django/Celery | Spring |
|--------------|--------|
| [X] | [Y] |

**다음 추천 토픽:** [prerequisite map 기반]
```

## context7 Usage

각 토픽에서 context7 MCP로 조회할 라이브러리:
- `spring-batch` — Spring Batch reference
- `spring-kafka` — Spring Kafka docs
- `apache-kafka` — Kafka concepts (broker, partition, offset)

## Integration with Other Skills

- 학습 후 `/knowledge:session-til` → Notion Dev Scraps 저장
- 아키텍처 질문 → `/knowledge:dev-concept` 연계
- 코드 연습 → `/learn:java-kata` 연계
- Spring Boot 기초 먼저 → `/learn:spring-guide`

## Notes

- Spring Boot 3.x + Java 21 기준
- Woowa/Kakao/Line 데이터 엔지니어링 JD 기반 토픽 선정
- 매 토픽 끝에 면접 빈출 질문 1-2개 포함
- Django에 없는 개념은 "Django에는 없음 — 왜냐하면" 구조로 설명
