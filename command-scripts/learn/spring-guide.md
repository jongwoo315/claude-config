# Spring Boot Learning Topics

## Prerequisites Map

```
spring-di ──→ spring-mvc ──→ spring-test
    │              │              │
    ▼              ▼              ▼
spring-aop    jpa-basics    spring-security
    │              │
    ▼              ▼
@Transactional jpa-relations ──→ querydsl
                   │
                   ▼
              jpa-performance (N+1, batch, cache)
```

## Topics

### Core (Week 1-2)

| ID | Topic | Prerequisites | Django Mapping |
|----|-------|--------------|----------------|
| 01 | spring-di | Java basics | 없음 (Django는 DI 안 씀) |
| 02 | spring-mvc | spring-di | DRF ViewSet + Serializer |
| 03 | spring-validation | spring-mvc | DRF Serializer validation |
| 04 | spring-error-handling | spring-mvc | DRF exception_handler |
| 05 | spring-test | spring-mvc | pytest-django |

### Data (Week 2-3)

| ID | Topic | Prerequisites | Django Mapping |
|----|-------|--------------|----------------|
| 06 | jpa-entity | spring-di | Django Model |
| 07 | jpa-repository | jpa-entity | Django Manager/QuerySet |
| 08 | jpa-relations | jpa-entity | ForeignKey, M2M |
| 09 | jpa-query | jpa-repository | QuerySet chaining |
| 10 | querydsl | jpa-query | Django Q objects |
| 11 | jpa-performance | jpa-relations | select_related, prefetch_related |

### Advanced (Week 3-4)

| ID | Topic | Prerequisites | Django Mapping |
|----|-------|--------------|----------------|
| 12 | spring-security | spring-mvc | DRF auth + permission |
| 13 | spring-aop | spring-di | decorator, middleware |
| 14 | spring-transaction | spring-aop, jpa | Django @transaction.atomic |
| 15 | spring-cache | spring-aop | django-cacheops, Redis |
| 16 | spring-async | spring-di | Celery task |
| 17 | spring-events | spring-di | Django signals |
| 18 | spring-actuator | spring-mvc | django-health-check |

## Session Structure

Each topic session follows:

1. **Django 비교** — "Django에서는 X, Spring에서는 Y" 브릿지 설명
2. **핵심 개념** — 어노테이션, 라이프사이클, 동작원리
3. **코드 실습** — 사용자가 직접 작성 (context7로 최신 docs 참조)
4. **퀴즈** — 3-5개 확인 문제
5. **실전 과제** — 포트폴리오 프로젝트에 적용

## Stack Versions (use context7 for latest)

- Spring Boot 3.x
- Spring Framework 6.x
- Java 21 (주력) / Kotlin 1.9+
- Gradle (Kotlin DSL)
