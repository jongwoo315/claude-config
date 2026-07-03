---
name: learn
description: Entry point for 6-month backend career transition curriculum (Python → Java/Kotlin). Shows learning dashboard, available commands, and recommended next action.
---

# Learn — Career Transition Curriculum

## Overview

6개월 이직 커리큘럼 (Python → Java/Kotlin 백엔드) 진입점.
현재 진도 확인 + 사용 가능한 학습 커맨드 안내 + 오늘 추천 학습 제안.

## Flow

### 1. Load Progress

Load progress data: `~/.claude/command-scripts/learn-progress.json`

### 2. Show Dashboard

```
# Learn — Backend Career Transition

**시작일:** [start_date] | **경과:** [N]주차 / 26주 | **타겟:** [target_companies]

## 오늘의 추천
[진도 + 요일 기반 추천 학습 1-2개]

## Available Commands

| Command | Description | Status |
|---------|-------------|--------|
| `/learn:java-kata [topic]` | Java/Kotlin 코딩 연습 | [누적 세션 수]세션 ([총 solved]/[총 total]) |
| `/learn:spring-guide [topic]` | Spring Boot 개념 학습 | [완료 토픽 수] 토픽 |
| `/learn:algorithm [pattern]` | 알고리즘 패턴 연습 | [풀이 수]문제 |
| `/learn:system-design [problem]` | 시스템 설계 연습 | [연습 수]회 |
| `/learn:mock-interview [company]` | 모의 면접 시뮬레이션 | [세션 수]회 |
| `/learn:tracker [cmd]` | 진도 추적 + 리포트 | — |

## Month [N] Progress — [Focus]

[토픽별 난이도 진행 상황 표시]
| Topic | warm-up | practice | challenge |
|-------|---------|----------|-----------|
각 셀: ⬜ (미시작) 또는 ✅ [solved]/[total] ([attempts]회)

## Quick Links
- `/learn:tracker plan` — 이번 주 학습 계획
- `/learn:tracker weekly` — 주간 리포트 (Notion 저장)
- `/learn:algorithm mock` — 실전 모의 코딩테스트
- `/learn:mock-interview [company] full` — 전체 프로세스 모의면접
```

**Status 계산 (java_kata):**
- `topics` 객체를 순회하여 각 토픽의 `last_practiced` 데이터를 읽음
- 누적 세션 수: 모든 토픽의 모든 난이도의 `attempts` 합계
- 총 solved/total: 모든 토픽의 모든 난이도의 `solved`/`total` 합계
- Month Progress 테이블: 해당 월의 토픽만 필터링하여 난이도별 상태 표시

### 3. Suggest Next Action

진도 데이터 기반으로 가장 적절한 다음 학습을 추천:

**추천 로직:**
1. 현재 월(month) 목표 확인
2. 미완료 토픽 중 선수과목 충족된 것 우선
3. 알고리즘은 매일 → 오늘 안 했으면 알고리즘 먼저 추천
4. 약점 패턴/토픽이 있으면 우선 배치

### 4. Wait for User Choice

사용자가 커맨드를 선택하면 해당 커맨드 실행.

## Related Skills (기존)

| Skill | When to Use |
|-------|-------------|
| `/dev-concept [name]` | 아키텍처 패턴 심화 (DDD, CQRS, saga 등 13개) |
| `/session-explain` | 학습 내용 Notion 저장 |
| `/session-til` | 세션 마무리 TIL 기록 |
| `/tdr` | 기술 결정 기록 (면접 준비) |

## Month Targets

| Month | Focus | Key Commands |
|-------|-------|-------------|
| 1 | Java 기초 + JVM | `java-kata` (Level 1) |
| 2 | Kotlin + Spring Boot | `java-kata` (Level 2) + `spring-guide` (Core) |
| 3 | 실무 프로젝트 + 알고리즘 시작 | `spring-guide` (Data) + `algorithm` |
| 4 | 인프라 + 시스템 디자인 | `spring-guide` (Advanced) + `system-design` |
| 5 | 심화 + 면접 준비 | `algorithm` + `mock-interview` |
| 6 | 지원 + 실전 | `mock-interview full` + `algorithm mock` |
