---
name: django-why-cards
description: Django 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Django Why Cards

## Parameters

```
/learn:django-why-cards              — 토픽 목록 표시 후 선택
/learn:django-why-cards orm          — ORM/QuerySet 카드
/learn:django-why-cards migration    — Migration 카드
/learn:django-why-cards cbv          — Class-Based View 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `django` |
| Title | `Django Why Cards` |
| Content path | `~/.claude/command-scripts/learn/django-why-cards.md` |
| Language | `Python / Django` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| orm, 쿼리셋, queryset | django-orm |
| migration, 마이그레이션 | django-migrations |
| cbv, views, 뷰 | django-views |
| middleware, 미들웨어 | django-middleware |
| signal, 시그널 | django-signals |
| auth, 인증 | django-auth |
| rest, drf, serializer, 시리얼라이저 | django-rest |
| n+1, select_related, prefetch | django-n1 |

## Topic Order

1. django-orm
2. django-migrations
3. django-views
4. django-middleware
5. django-signals
6. django-rest
7. django-n1

> NOTE: `django-auth` is in the alias table but missing from the topic order list. Verify content file `##` headers and add if present.

## Domain Scenario Hints

- Use different class names and different bug patterns
- Concrete artifact: broken code snippet

## Framework Version Notes

- Django 4.x / Python 3.11+ 기준
