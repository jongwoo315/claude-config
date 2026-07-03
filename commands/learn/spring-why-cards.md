---
name: spring-why-cards
description: Spring 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Spring Why Cards

## Parameters

```
/learn:spring-why-cards              — 토픽 목록 표시 후 선택
/learn:spring-why-cards di           — 의존성 주입 카드
/learn:spring-why-cards security     — Spring Security/JWT 카드
/learn:spring-why-cards entity       — JPA 엔티티 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `spring` |
| Title | `Spring Why Cards` |
| Content path | `~/.claude/command-scripts/learn/spring-why-cards.md` |
| Language | `Java / Spring Boot` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| di, 의존성 주입 | spring-di |
| mvc, 컨트롤러 | spring-mvc |
| validation, 검증 | spring-validation |
| error, 예외 | spring-error-handling |
| test, 테스트 | spring-test |
| entity, 엔티티 | jpa-entity |
| repo, repository | jpa-repository |
| relations, 연관관계 | jpa-relations |
| query, jpql | jpa-query |
| querydsl, 동적쿼리 | querydsl |
| performance, 성능 | jpa-performance |
| security, 인증, jwt | spring-security |

## Topic Order

1. spring-di
2. spring-mvc
3. spring-validation
4. spring-error-handling
5. spring-test
6. jpa-entity
7. jpa-repository
8. jpa-relations
9. jpa-query
10. querydsl
11. jpa-performance
12. spring-security

## Domain Scenario Hints

- Use different class names and different bug patterns
- Concrete artifact: broken code snippet

## Framework Version Notes

- Spring Boot 3.x 기준
