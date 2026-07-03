---
name: repo-catchup
description: Use when you need to understand a vibe-coded or unfamiliar repo - generates structured understanding through indexing, analysis, and design doc extraction
---

# Repo Catchup - Understand a Vibe-Coded Repository

## Overview

Vibe coding으로 빠르게 만들었거나, 오랫동안 안 본 레포의 전체 구조와 핵심 로직을 체계적으로 파악하는 워크플로우.
기존 스킬들을 순서대로 조합하여 레포에 대한 이해도를 높입니다.

## When to Use

- Vibe coding으로 만든 레포를 제대로 이해하고 싶을 때
- 오래된 개인 프로젝트를 다시 들여다볼 때
- 다른 사람(또는 과거의 나)이 만든 코드를 인수받을 때
- "이 레포가 뭘 하는 건지 모르겠다" 싶을 때

## Workflow

### Step 1: Repo Indexing

레포 전체 구조를 압축 인덱스로 생성합니다.

```
/sc:index-repo
```

**결과물:** 레포의 디렉토리 구조, 주요 파일, 엔트리포인트 요약
**목적:** 전체 지도를 먼저 확보

### Step 2: Code Analysis

품질, 보안, 성능, 아키텍처 관점에서 종합 분석합니다.

```
/sc:analyze
```

**결과물:** 이슈 목록, 개선 포인트, 아키텍처 평가
**목적:** "이 코드 괜찮은가?" 에 대한 답

### Step 3: Key Module Deep Dive

Step 1-2 결과를 바탕으로, 핵심 모듈 2-3개를 선정하여 상세 설명합니다.

```
/sc:explain
```

**대상 선정 기준:**
- 엔트리포인트 (main, app, index)
- 가장 복잡한 모듈 (Step 2에서 이슈가 많은 곳)
- 도메인 핵심 로직 (비즈니스 규칙이 집중된 곳)

### Step 4: Architecture & Concept Review (선택)

도메인 경계가 불명확하거나 아키텍처 패턴 적용이 필요할 때 분석합니다.

```
/knowledge:dev-concept
```

**결과물:** `docs/<pattern>.md`
**목적:** 아키텍처 패턴 분석 및 적용 방향 설정

## Output Summary

워크플로우 완료 후, 사용자에게 다음을 요약하여 제시:

1. **레포 구조 요약** (1-2문단)
2. **핵심 모듈과 역할** (테이블)
3. **주요 이슈/개선점** (우선순위순)
4. **추천 다음 액션** (리팩터링, 테스트 추가, 문서화 등)

## Notes

- Step 1-3은 항상 실행, Step 4-5는 사용자에게 필요 여부를 물어볼 것
- 각 Step 결과를 사용자에게 공유하며 진행 (중간 피드백 반영)
- 대형 레포의 경우 Step 3에서 모듈 수를 제한 (3개 이내)
