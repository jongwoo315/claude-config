---
name: java-kata
description: Java/Kotlin coding exercises — generate problems, review user solutions, compare with Python. Triggers on language practice, syntax learning, or explicit invocation.
---

# Java/Kotlin Kata

## Overview

Java/Kotlin 코딩 연습 세션. 문제 생성 → 사용자 풀이 → 리뷰 + Python 비교.
파이썬 개발자가 Java/Kotlin으로 전환하는 과정에 최적화.

## Parameters

```
/learn:java-kata                    — 토픽 목록 표시 후 선택
/learn:java-kata stream             — Java Stream API 연습
/learn:java-kata coroutines         — Kotlin Coroutines 연습
/learn:java-kata stream challenge   — 난이도 높은 문제
```

## Setup

1. Load topic reference: `~/.claude/command-scripts/learn/java-kata.md`
2. Parse argument:
   - `topic` + `difficulty` 모두 지정 → 바로 진행 (e.g., `/learn:java-kata stream challenge`)
   - `topic`만 지정 → 난이도 선택 프롬프트 표시
   - 인자 없음 → 토픽 테이블 출력, 사용자 선택 대기 → 이후 난이도 선택

### Difficulty Selection (난이도 미지정 시)

토픽이 결정된 후 difficulty가 명시되지 않았으면 아래 표를 보여주고 선택 요청:

```
| Difficulty | 설명 | 시간 | 문제 수 |
|-----------|------|------|---------|
| warm-up | 문법 확인, 가볍게 시작 | 5분 | 2-3개 |
| practice | 개념 적용 (기본값) | 15분 | 1-2개 |
| challenge | 복합 개념, 실무 수준 | 30분 | 1개 |

어떤 난이도로 할까요?
```

사용자가 선택하지 않으면 `practice`를 기본값으로 사용.

## Session Flow

### Step 1: Topic Intro (2분)

해당 토픽의 핵심 개념을 **Python 비교**와 함께 간결하게 설명.

Format:
```
## [Topic] — Java/Kotlin Kata

### Python에서는...
[Python에서 이 개념이 어떻게 동작하는지 1-2줄]

### Java/Kotlin에서는...
[핵심 차이점, 주의할 점 3-5줄]

### 오늘 연습할 것
[이번 세션에서 다룰 구체적 스킬]
```

### Step 2: Problem Generation

**difficulty에 따라 문제 생성:**

| Difficulty | 설명 | 시간 | 문제 수 |
|-----------|------|------|---------|
| warm-up | 문법 확인 | 5분 | 2-3개 |
| practice | 개념 적용 (기본값) | 15분 | 1-2개 |
| challenge | 복합 개념 | 30분 | 1개 |

**문제 제시 형식:**
```
### Problem: [제목]

[시나리오/요구사항 설명]

**Input:** [입력 형식 + 예시]
**Output:** [출력 형식 + 예시]

**Constraints:**
- [제약 조건]

**Hint:** [사용해야 할 Java/Kotlin 기능 힌트]
```

프로젝트 디렉토리에 풀이 파일 생성:
- Java: `kata/[topic]/Problem.java` (클래스 + 메서드 시그니처 + TODO)
- Kotlin: `kata/[topic]/Problem.kt` (함수 시그니처 + TODO)

### Step 3: User Solves

사용자가 코드를 작성할 때까지 대기.
- 질문이 오면 힌트를 단계적으로 제공 (답을 바로 주지 않음)
- 막히면 Python 등가 코드를 보여주고 "이걸 Java/Kotlin으로 변환해보세요" 유도

### Step 4: Review

사용자 코드를 리뷰:

```
### Review

**Correctness:** ✅/❌ [정확성]
**Idiomatic:** [Java/Kotlin다운 코드인가]
**Performance:** [시간/공간 복잡도]

### Python 비교
[같은 로직의 Python 코드 — 차이점 하이라이트]

### Java/Kotlin 비교
[Java로 풀었다면 Kotlin 버전도, 반대도 마찬가지]

### 개선 포인트
1. [구체적 개선 사항]
```

### Step 4.5: Record Progress

Review 완료 후 `progress.json`을 업데이트한다.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"java_kata": {
  "topics": {
    "[topic]": {
      "last_practiced": {
        "warm-up": null | { "date": "YYYY-MM-DD", "attempts": N, "solved": N, "total": N },
        "practice": null | { ... },
        "challenge": null | { ... }
      }
    }
  },
  "session_log": [
    { "date": "YYYY-MM-DD", "topic": "...", "difficulty": "...", "problems": [...], "solved": N, "total": N }
  ]
}
```

**누적 로직:**
- 해당 topic+difficulty에 기존 기록이 있으면: `attempts += 1`, `solved += 이번 solved`, `total += 이번 total`, `date` 갱신
- 없으면: `attempts: 1`, 이번 세션 결과로 초기화
- `session_log`에 이번 세션 항상 추가

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

사용자가 "기록하기" 선택 시에만 progress.json 업데이트.

### Step 5: Next

```
다음 뭘 할까요?
- 같은 토픽 다른 문제
- 난이도 올리기
- 다른 토픽
- 세션 종료 (/session-til로 정리)
```

## Language Selection

- Month 1: **Java** 우선 (기본기)
- Month 2+: **Kotlin** 우선 (실무)
- 항상 둘 다 비교 코드 제공

## context7 Integration

`context7` MCP를 활용하여 최신 Java/Kotlin API 문서 확인:
- Java: `java.util.stream`, `java.util.concurrent` 등
- Kotlin: `kotlinx.coroutines`, Kotlin stdlib 등
- 사용자 풀이 리뷰 시 최신 API 권장 사항 반영

## Notes

- 문제는 실무 시나리오 기반으로 생성 (추상적 알고리즘보다 실용적 상황)
- Python 비교는 항상 포함 — 전환 학습의 핵심
- 프로젝트에 kata/ 디렉토리로 풀이 누적 (포트폴리오 겸용)
