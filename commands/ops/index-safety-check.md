---
name: index-safety-check
description: Use when adding database indexes via Django migrations — scans all queries on affected tables for implicit ordering bugs (positional access without order_by) that cause business logic failures after MySQL optimizer changes execution plan
---

# Index Safety Check

## Origin: DEV-3333 Incident

billing 테이블에 `(order_id, status)` 복합 인덱스 추가 후, MySQL optimizer가 인덱스를 사용하면서 쿼리 결과의 암묵적 PK 순서가 깨짐. `values_list("status")` → `list()` → `[-1] == [-2]` 위치 비교가 오작동하여 취소 후 재신청 시 ALREADY_BILLING 프로덕션 오류 발생.

## How to Invoke

- `/ops:index-safety-check` — 현재 브랜치 diff에서 자동 감지
- `ops:github-pr-review`에서 마이그레이션 AddIndex 감지 시 실행 제안

## Process

### Step 1: Index Detection

브랜치 diff에서 인덱스 추가 마이그레이션 파싱:

```bash
# 현재 브랜치가 feature 브랜치인 경우:
git diff production...HEAD -- 'web/*/migrations/*.py'

# production 브랜치에 있는 경우: feature 브랜치명을 확인하거나 사용자에게 질문
```

파싱 대상:
- `migrations.AddIndex(model_name='...', index=models.Index(fields=[...]))`
- `models.Index(fields=[...])` in model Meta changes

결과: `[(model_name, table_name, index_fields)]` 리스트

**table_name 확인:** 이 프로젝트는 Django 기본 `app_model` 대신 `Meta.db_table`을 직접 설정. 모델 코드에서 실제 테이블명을 확인할 것.

**인덱스 추가가 감지되지 않으면 "No index additions detected" 출력 후 종료.**

### Step 2: Meta Ordering 확인

각 모델의 `class Meta`에 `ordering` 필드가 있는지 확인.
- `ordering` 있으면: Django가 모든 쿼리에 ORDER BY 추가 → 위험 낮음 (하지만 여전히 Step 3 수행)
- `ordering` 없으면: 암묵적 순서 변경 위험 존재

### Step 3: Query Scan

각 모델에 대해 4가지 경로로 쿼리 전수 검색 (migrations 디렉토리 제외):

1. **직접 ORM**: `ModelName.objects`
2. **역참조 / FK lookup**: 모델 정의에서 `related_name` 확인 후 검색. 포함 대상:
   - `modelname_set` (기본 역참조)
   - `related_name` 값 (예: `favorite_match`)
   - `__` lookup 체인 (예: `favoritematch__user_id`)
3. **FilteredRelation / Prefetch**: `FilteredRelation("modelname_lowercase", ...)` 및 `Prefetch("modelname_lowercase", ...)` 패턴. Django ORM이 소문자 모델명으로 역참조하므로 별도 검색 필요.
4. **Raw SQL**: `table_name` 문자열 검색

**테스트 파일 포함:** 테스트에서도 `list(qs)[0]` 같은 패턴이 있으면 순서 변경 시 flaky test 원인이 됨. 별도 섹션으로 보고.

### Step 4: Risk Pattern Matching

각 쿼리 위치에서 **queryset 변수가 더 이상 참조되지 않을 때까지** (최소 30줄) 주변 코드를 읽고 다음 패턴 매칭:

#### Critical (반드시 수정 필요)

| 패턴 | 예시 | 위험 |
|------|------|------|
| `values_list()` + 위치 접근 | `list(qs.values_list(...))[−1]` | DEV-3333 원본 패턴 |
| `list(qs)` + 인덱스 비교 | `billing_list[-1] == billing_list[-2]` | 순서 변경 시 비교 대상 바뀜 |

#### Important (수정 권장)

| 패턴 | 예시 | 위험 |
|------|------|------|
| `qs[0]` 슬라이싱 (order_by 없이) | `qs.filter(...)[0]` | `.first()` 와 달리 pk ordering 없음 |
| order_by 없는 쿼리 → 순서 의존 로직 | for loop에서 이전 항목과 비교 | optimizer가 순서 바꾸면 로직 깨짐 |
| `values_list(..., flat=True)` → 순서 의존 소비 | 정렬 가정하에 리스트 처리 | 인덱스 변경 시 순서 보장 안 됨 |

#### Safe (보고서에 포함하되 "Safe" 판정)

- `.exists()`, `.count()` — 순서 무관
- `.first()`, `.last()` — Django가 `ORDER BY pk` 추가
- `.get(pk=...)` — 단건 조회
- 쓰기: `.update()`, `.create()`, `.delete()`, `.bulk_update()`, `.update_or_create()`
- 집계: `Count()`, `Sum()`, `Avg()`, `annotate()`, `Subquery` + 집계
- 명시적 `order_by()` 체이닝된 쿼리
- `Exists()` subquery, `OuterRef` + 집계
- `FilteredRelation` + boolean annotation (순서 무관)
- 독립 처리 반복 (for loop에서 각 항목 개별 처리, 위치 접근 없음)

### Step 5: Report

```markdown
## Index Safety Check Report

### Indexes Detected
| Model | Table | Index Fields | Migration |
|-------|-------|-------------|-----------|

### Analysis: {Model} ({fields})

Meta ordering: {있음 (["pk"]) / 없음}

| 위치 | 쿼리 패턴 | 판정 | 이유 |
|------|-----------|------|------|

### Result
- {No Risk Found / N Critical, M Important issues found}
- {수정 제안 포함}
```

**Critical 이슈 발견 시:** 각 이슈에 대해 구체적 수정 방안 제시:
- 방안 A: 해당 쿼리에 `.order_by("pk")` 추가
- 방안 B: 모델 Meta에 `ordering = ["pk"]` 추가 (모든 쿼리에 적용)

## Integration: ops:github-pr-review

`github-pr-review` Step 3.5에서 마이그레이션 diff에 `AddIndex` 또는 `models.Index` 패턴이 감지되면:

> "인덱스 추가 마이그레이션이 감지되었습니다. `/ops:index-safety-check`로 암묵적 순서 의존 위험을 분석할까요?"

리포트 결과는 PR 리뷰 코멘트에 "Index Safety" 섹션으로 포함.
