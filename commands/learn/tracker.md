---
name: tracker
description: Learning progress tracker — weekly reports, progress visualization, Notion integration. Track algorithm count, topics covered, mock interview scores.
---

# Learning Tracker

## Overview

6개월 이직 커리큘럼 진도 추적. 학습 현황 조회, 주간 리포트, Notion 기록.

## Parameters

```
/learn:tracker                  — 현재 진도 대시보드
/learn:tracker weekly           — 주간 리포트 생성 + Notion 저장
/learn:tracker log algo 3       — 오늘 알고리즘 3문제 풀었음 기록
/learn:tracker log kata stream  — java-kata stream 토픽 완료 기록
/learn:tracker log spring jpa-basics — spring-guide jpa-basics 완료 기록
/learn:tracker log design payment-system B — 시스템 디자인 연습 B등급
/learn:tracker log mock toss coding "Lean Hire" — 모의면접 결과 기록
/learn:tracker plan             — 이번 주 학습 계획 제안
```

## Data Storage

진도 데이터를 로컬 JSON으로 관리:

**File:** `~/.claude/command-scripts/learn-progress.json`

```json
{
  "start_date": "2026-03-17",
  "target_companies": ["toss", "kakaobank", "musinsa", "youtube-music"],
  "algorithm": {
    "total_solved": 0,
    "by_pattern": {},
    "daily_log": []
  },
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
  },
  "spring_guide": {
    "topics": {
      "[topic]": {
        "last_practiced": { "date": "YYYY-MM-DD", "attempts": N, "solved": N, "total": N }
      }
    },
    "session_log": [
      { "date": "YYYY-MM-DD", "topic": "...", "problems": [...], "solved": N, "total": N }
    ]
  },
  "algorithm": {
    "patterns": {
      "[pattern]": {
        "last_practiced": { "date": "YYYY-MM-DD", "attempts": N, "solved": N, "total": N }
      }
    },
    "daily_log": [
      { "date": "YYYY-MM-DD", "pattern": "...", "problems": [...], "solved": N, "total": N }
    ]
  },
  "system_design": {
    "completed_problems": [],
    "scores": {}
  },
  "mock_interview": {
    "sessions": []
  },
  "weekly_reports": []
}
```

**누적 로직 (java_kata, spring_guide, algorithm 공통):**
- 기존 기록 있으면: `attempts += 1`, `solved += 이번 solved`, `total += 이번 total`, `date` 갱신
- 없으면: `attempts: 1`, 이번 세션 결과로 초기화
- `session_log` / `daily_log`에 이번 세션 항상 추가

## Commands

### Dashboard (`/learn:tracker`)

현재 진도를 한눈에 보여주기:

```
## Learning Dashboard — Week [N]/26

### Month [M] Progress
[현재 월 목표 대비 진도 바]

### Algorithm
- Total: [N]문제 (목표: [target])
- 이번 주: [N]문제
- 패턴별: hash-map ██████░░ 6/10, dp ████░░░░ 4/10, ...

### Java/Kotlin Kata
- 누적: [총 세션]세션 ([총 solved]/[총 total])
- Level 1:
  | Topic | warm-up | practice | challenge |
  각 셀: ⬜ 또는 ✅ [solved]/[total] ([attempts]회)
- Level 2: [동일 형식]
- Level 3: [동일 형식]

### Spring Guide
- 누적: [총 세션]세션 ([총 solved]/[총 total])
- 토픽별: ⬜ 또는 ✅ [solved]/[total] ([attempts]회)

### System Design
- 연습 횟수: [N]
- 평균 등급: [X]
- 최근: [problem] — [grade]

### Mock Interview
- 총 [N]회
- 최근 결과: [company] [round] — [decision]

### 추천
[현재 진도 기반 오늘/이번 주 추천 학습]
```

### Weekly Report (`/learn:tracker weekly`)

주간 리포트 생성 + Notion Dev Scraps에 저장.

```
## Weekly Report — Week [N] ([날짜 범위])

### 이번 주 성과
- 알고리즘: [N]문제 ([패턴별 breakdown]) — 누적 [solved]/[total]
- Java/Kotlin Kata: [이번 주 세션 수]세션, [이번 주 solved]/[이번 주 total] — 누적 [solved]/[total]
- Spring Guide: [이번 주 세션 수]세션, [이번 주 solved]/[이번 주 total] — 누적 [solved]/[total]
- System Design: [연습 내역]
- Mock Interview: [결과]

### 목표 대비
| Area | Target | Actual | Status |
|------|--------|--------|--------|
| Algorithm | [N]문제 | [N]문제 | ✅/⚠️/❌ |
| Kata | [topics] | [topics] | ✅/⚠️/❌ |
| Spring | [topics] | [topics] | ✅/⚠️/❌ |

### 약점 분석
[데이터 기반 약점 영역 식별]

### 다음 주 계획
[자동 생성된 추천 계획]
```

**Notion 저장:**
- Database: Dev Scraps (`76e9673e-d91b-41b2-9779-c0940040f542`)
- API Key: `NOTION_API_KEY`
- 제목: `YYYY-MM-DD Weekly Learning Report (Week N)`
- 주제: `Learning Tracker`
- 카테고리: `✍️ In Action`

### Log (`/learn:tracker log`)

학습 활동 기록:

```bash
/learn:tracker log algo 2              # 알고리즘 2문제
/learn:tracker log algo 1 dp-basic     # 알고리즘 1문제 (DP 패턴)
/learn:tracker log kata generics practice 2 2  # kata generics practice [solved] [total]
/learn:tracker log spring spring-di 3 4        # spring spring-di [solved] [total]
/learn:tracker log design url-shortener A  # 시스템 디자인 A등급
/learn:tracker log mock google coding "Hire"  # 모의면접 결과
```

기록 후 간단한 확인 메시지 + 오늘의 누적 표시.

### Plan (`/learn:tracker plan`)

이번 주 학습 계획 자동 생성:

1. 현재 진도 분석
2. 커리큘럼 월별 목표 확인
3. 약점 영역 우선 배치
4. 일별 추천 스케줄 생성

```
## 이번 주 학습 계획 (Week [N])

### 월별 목표: [Month M 목표 요약]

| 요일 | 오전 (1-2h) | 저녁 (2-3h) |
|------|-------------|-------------|
| 월 | algo: [pattern] 2문제 | spring: [topic] |
| 화 | algo: [pattern] 2문제 | kata: [topic] |
| ... | ... | ... |
| 토 | system-design: [problem] | 복습 |
| 일 | mock-interview: [company] | 정리 + /session-til |
```

## Curriculum Milestones

```json
{
  "month_1": {
    "name": "Java 기초 + JVM",
    "algorithm_target": 0,
    "kata_topics": ["types", "collections", "stream", "generics", "exceptions", "oop"],
    "spring_topics": []
  },
  "month_2": {
    "name": "Kotlin + Spring Boot",
    "algorithm_target": 0,
    "kata_topics": ["null-safety", "data-class", "extensions", "coroutines", "sealed", "scope-functions"],
    "spring_topics": ["spring-di", "spring-mvc", "spring-validation", "spring-error-handling", "spring-test", "jpa-entity", "jpa-repository"]
  },
  "month_3": {
    "name": "실무 프로젝트 + 알고리즘 시작",
    "algorithm_target": 40,
    "kata_topics": ["spring-di", "spring-mvc", "jpa-basics", "jpa-relations"],
    "spring_topics": ["jpa-relations", "jpa-query", "querydsl"]
  },
  "month_4": {
    "name": "인프라 + 시스템 디자인",
    "algorithm_target": 40,
    "spring_topics": ["spring-test", "spring-cache", "spring-async", "spring-events"],
    "system_design_target": 4
  },
  "month_5": {
    "name": "심화 + 면접 준비",
    "algorithm_target": 50,
    "spring_topics": ["spring-security", "spring-aop", "spring-transaction", "jpa-performance"],
    "system_design_target": 4,
    "mock_interview_target": 4
  },
  "month_6": {
    "name": "지원 + 실전",
    "algorithm_target": 30,
    "mock_interview_target": 8
  }
}
```

## Notes

- java-kata, algorithm, spring-guide는 세션 Review 완료 후 자동으로 progress.json 업데이트 (사용자 확인 후)
- `/learn:tracker log`는 수동 보정이나 외부 학습 기록용
- 주간 리포트는 일요일 저녁에 하면 좋음
- 대시보드의 진도 바는 텍스트 기반 (█░)
