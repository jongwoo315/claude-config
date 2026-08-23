---
name: algorithm
description: Algorithm practice sessions — pattern-based problem generation, Java/Kotlin solving, complexity analysis, and optimization feedback. Triggers on algorithm/coding test practice requests.
---

# Algorithm Practice

## Overview

알고리즘 패턴별 연습 세션. 패턴 설명 → 문제 출제 → Java/Kotlin 풀이 → 리뷰.
코딩테스트 합격을 목표로 체계적 패턴 학습.

## Parameters

```
/learn:algorithm                     — 패턴 목록 표시 후 선택
/learn:algorithm dp-basic            — DP 기초 연습
/learn:algorithm sliding-window      — 슬라이딩 윈도우 연습
/learn:algorithm mock                — 실전 모의 (랜덤 2-3문제, 시간 제한)
/learn:algorithm review              — 이전 풀이 복습
```

## Setup

1. Load pattern reference: `~/.claude/command-scripts/learn/algorithm.md`
2. Parse argument → pattern name or mode
3. No argument → Tier별 패턴 테이블 출력
4. `mock` → 실전 모의 모드 (별도 플로우)

## Standard Session Flow

### Step 1: Pattern Intro (5분)

```
## [Pattern Name] — Algorithm Practice

### 핵심 아이디어
[패턴의 기본 원리 2-3줄]

### 적용 시그널
이런 문제가 나오면 이 패턴을 떠올려야 합니다:
- [시그널 1]
- [시그널 2]

### 시간/공간 복잡도
- 일반적: O(?)
- 최적: O(?)

### Java/Kotlin 구현 팁
[Python과 다른 구현 포인트 — 예: Python deque vs Java ArrayDeque]
```

### Step 2: Representative Problem

패턴 대표 문제 1개 출제.

```
### Problem: [제목] ([Difficulty])

[문제 설명 — 실무 시나리오 또는 클래식 문제]

**Input:** [형식 + 예시]
**Output:** [형식 + 예시]
**Example:**
  Input: [...]
  Output: [...]
  Explanation: [...]

**Constraints:**
- [제약 조건 — 시간복잡도 힌트]

**Language:** Java / Kotlin (선택)
```

풀이 파일 생성:
```
kata/algorithm/[pattern]/Solution.java (또는 .kt)
  — 메서드 시그니처 + 테스트 케이스 포함
```

### Step 3: User Solves

사용자가 풀 때까지 대기.

**힌트 시스템 (단계적):**
1. "어떤 자료구조를 사용할지 생각해보세요"
2. "핵심 연산의 시간복잡도를 줄이려면?"
3. "[패턴명]의 핵심 아이디어를 적용해보세요"
4. Python 의사코드 힌트
5. 접근법 설명 (코드는 아직 안 줌)

**절대 하지 않을 것:** 사용자가 명시적으로 요청하기 전에 풀이 코드 제공

### Step 4: Review

```
### Review

**Correctness:** ✅/❌
**Time Complexity:** O(?) — [분석]
**Space Complexity:** O(?) — [분석]

### 코드 리뷰
[라인별 피드백 — 이디엄, 엣지케이스, 최적화]

### 최적 풀이 비교
[사용자 풀이 vs 최적 풀이 — 차이점만 하이라이트]

### Python vs Java/Kotlin
[같은 로직의 Python 코드 — 구현 차이 포인트]
```

### Step 4.5: Record Progress

Review 완료 후 `progress.json`을 업데이트한다.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"algorithm": {
  "patterns": {
    "[pattern]": {
      "last_practiced": { "date": "YYYY-MM-DD", "attempts": N, "solved": N, "total": N }
    }
  },
  "daily_log": [
    { "date": "YYYY-MM-DD", "pattern": "...", "problems": [...], "solved": N, "total": N }
  ]
}
```

**누적 로직:**
- 기존 기록 있으면: `attempts += 1`, `solved += 이번 solved`, `total += 이번 total`, `date` 갱신
- 없으면: `attempts: 1`, 이번 세션 결과로 초기화
- `daily_log`에 이번 세션 항상 추가

**사용자 확인 후 기록** — "progress.json 업데이트할까요?" 물어본 뒤 진행.

### Step 5: Variation

난이도를 올린 변형 문제 1개:
- 제약 조건 강화 (더 큰 N)
- 추가 조건 (정렬된 입력, 음수 포함 등)
- 패턴 조합 (예: sliding-window + hash-map)

### Step 6: Pattern Summary

```
### [Pattern] 정리

**언제 쓰나:** [1줄 판단 기준]
**핵심 구현:** [Java/Kotlin 2-3줄 핵심 코드]
**흔한 실수:** [주의점]
**면접 팁:** [면접에서 이 패턴 문제가 나오면 먼저 말할 것]
```

## Mock Mode (`/learn:algorithm mock`)

실전 코딩테스트 시뮬레이션.

### Setup
```
### 모의 코딩테스트

**회사 스타일:** [Toss/KakaoBank/Musinsa/Google 선택]
**문제 수:** [회사별 기본값]
**시간 제한:** [회사별 기본값]
**언어:** Java / Kotlin

준비되면 시작합니다.
```

### Company Defaults
| Company | Problems | Time | Difficulty |
|---------|----------|------|-----------|
| Toss | 2-3문제 | 120분 | 실버~골드 |
| KakaoBank | 4-5문제 | 180분 | 카카오 스타일 |
| Musinsa | 2-3문제 | 120분 | 구현 중심 |
| Google | 2문제 | 90분 | LeetCode M-H |

### Mock Flow
1. 전체 문제 한번에 제시
2. 사용자가 순서 선택하여 풀이
3. 시간 관리 알림 (남은 시간 안내)
4. 전체 종료 후 총평:
   - 문제별 점수 (Pass/Partial/Fail)
   - 시간 배분 피드백
   - 약점 패턴 식별
   - 추천 연습 방향

## Record Progress

세션 종료 시 (Standard의 Step 6 후, Mock의 총평 후) progress.json 업데이트를 제안.

**업데이트 대상:** `~/.claude/command-scripts/learn-progress.json`

**구조:**
```json
"algorithm": {
  "total_solved": N,
  "by_pattern": { "[pattern]": N },
  "daily_log": [
    { "date": "YYYY-MM-DD", "pattern": "...", "problems": [...], "solved": N, "total": N, "mode": "standard|mock" }
  ]
}
```

**AskUserQuestion으로 선택지 제시:**
- ✅ 기록하기 — progress.json 업데이트
- ⏭️ 건너뛰기 — 기록 없이 다음으로

사용자가 "기록하기" 선택 시에만 progress.json 업데이트.

## Review Mode (`/learn:algorithm review`)

이전에 풀었던 문제 복습:
1. `kata/algorithm/` 디렉토리에서 이전 풀이 스캔
2. 틀렸거나 비효율적이었던 문제 우선 제시
3. 힌트 없이 다시 풀기
4. 이전 풀이와 비교

## Notes

- 모든 풀이는 `kata/algorithm/[pattern]/`에 저장
- Java 기준 풀이, Kotlin은 보조 (Python 비교도 포함)
- context7로 Java Collections/Kotlin stdlib 최신 API 확인
- 면접에서 "이 문제를 더 최적화할 수 있나요?" 대비 — 항상 follow-up 최적화 논의
