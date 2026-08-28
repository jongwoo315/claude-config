---
name: spring-guide
description: Spring Boot concept-by-concept guided learning with Django comparison, code exercises, and quizzes. Triggers on Spring/JPA/Spring Security learning requests.
---


**MANDATORY:** Load `~/.claude/commands/learn/_guide-common.md` BEFORE responding. 진행 방식(kickoff, snapshot, done 판정, notes.md 지속화, top-down 루프)은 전부 그 파일이 정본이다. 아래 내용은 그 위에 얹히는 토픽별 규칙이지 대체재가 아니다.

# Spring Boot Guide

## Overview

Spring Boot 개념별 가이드 학습. Django 경험자를 위한 브릿지 설명 포함.
각 토픽을 "Django에서는 X → Spring에서는 Y" 구조로 학습.

## Parameters

```
/learn:spring-guide                  — 토픽 맵 표시 후 선택
/learn:spring-guide jpa-relations    — JPA 관계 매핑 학습
/learn:spring-guide spring-security  — Spring Security 학습
```

## Setup

1. Load topic reference: `~/.claude/command-scripts/learn/spring-guide.md`
2. Parse argument → topic ID or name
3. No argument → prerequisite map + 토픽 테이블 출력
4. Prerequisite 확인 — 선수 토픽 미학습 시 경고 (강제는 아님)

## Session Flow

### Step 1: Django Bridge (5분)

```
## [Topic] — Spring Boot Guide

### Django에서는...
[Django에서 동일한 문제를 어떻게 해결하는지]
[코드 예시 포함]

### Spring에서는...
[Spring의 접근 방식이 다른 이유]
[철학적 차이: explicit vs implicit, DI vs module import 등]
```

### Step 2: Core Concepts (10분)

핵심 개념을 **context7** MCP로 최신 Spring Boot 3.x 문서 참조하여 설명.

설명 구조:
1. **What** — 이 기능이 무엇인가
2. **Why** — 왜 필요한가 (Django에서는 왜 없는가/다른가)
3. **How** — 어노테이션/설정/동작원리
4. **Gotcha** — 흔한 실수, 주의점

### Step 3: Live Code Exercise

사용자가 직접 코드를 작성하는 실습.

프로젝트에 실습 파일 준비:
```
learn-spring/src/main/java/com/example/[topic]/
├── [Controller/Service/Entity 등].java  ← 시그니처 + TODO
└── README.md                            ← 요구사항
```

**실습 설계 원칙:**
- 5-10줄 분량의 핵심 로직만 사용자가 작성
- 보일러플레이트는 미리 세팅
- 의미 있는 설계 선택이 포함된 과제 (정답이 하나가 아닌 것)

### Step 4: Quiz (5분)

3-5개 확인 문제. 형식:

```
### Quiz

**Q1.** @Autowired 대신 생성자 주입을 권장하는 이유는?
a) 성능이 더 좋다
b) 불변성 보장 + 테스트 용이
c) Spring 공식 권장이라서
d) Kotlin에서만 동작한다

**Q2.** [코드 스니펫] 이 코드의 문제점은?

**Q3.** Django의 [X]에 해당하는 Spring 어노테이션은?
```

퀴즈 후 정답 + 해설 제공.

**퀴즈 생성 규칙 (필수):**
- **코드 스니펫 주석 금지**: 문제로 사용하는 코드에 정답을 암시하는 주석 제거. 예: `// mock하지 않음` → 삭제
- **코드 자체가 정답 아니도록**: 코드 패턴만 보면 정답이 보이는 문제 지양. 개념 이해 없이 시각 패턴으로 풀리는 문제 제외
- **정답 위치 분산 필수**: 5문제 기준 a/b/c/d 각 1-2개씩 분배. b/c에 편중 금지. 문제 생성 후 정답 위치 검토하고 필요 시 보기 순서 재배열

### Step 5: Portfolio Task

포트폴리오 프로젝트에 바로 적용할 수 있는 과제 제시:

```
### 실전 과제

[토픽]을 포트폴리오 프로젝트에 적용하세요:

**Task:** [구체적 과제]
**File:** [생성/수정할 파일]
**Acceptance:** [완료 기준]
```

### Step 5.5: Record Progress

Review/Quiz 완료 후 `progress.json`을 업데이트한다.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"spring_guide": {
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
- 기존 기록 있으면: `attempts += 1`, `solved += 이번 solved`, `total += 이번 total`, `date` 갱신
- 없으면: `attempts: 1`, 이번 세션 결과로 초기화
- `session_log`에 이번 세션 항상 추가
- `solved`/`total`은 Quiz 정답 수 / Quiz 총 문제 수 기준

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

사용자가 "기록하기" 선택 시에만 progress.json 업데이트.

### Step 6: Wrap Up

```
### 정리

**오늘 배운 것:**
- [핵심 1]
- [핵심 2]
- [핵심 3]

**Django ↔ Spring 매핑:**
| Django | Spring |
|--------|--------|
| [X] | [Y] |

**다음 추천 토픽:** [prerequisite map 기반]
```

## context7 Usage

각 토픽에서 context7 MCP로 조회할 라이브러리:
- `spring-boot` — Spring Boot reference
- `spring-framework` — Core Spring
- `spring-data-jpa` — JPA
- `spring-security` — Security
- `kotlin` — Kotlin language

## Integration with Other Skills

- 학습 후 `/session-explain` → Notion에 상세 내용 저장
- 관련 아키텍처 패턴 → `/dev-concept` 연계
- 코드 연습 → `/learn:java-kata` 연계

## Notes

- Spring Boot 3.x + Java 기준 (Kotlin 코드도 병행 표시)
- 어노테이션 동작원리까지 설명 (면접에서 "내부적으로 어떻게 동작?" 질문 대비)
- 매 토픽 끝에 면접 빈출 질문 1-2개 포함
