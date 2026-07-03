---
name: fastapi-why-cards
description: FastAPI 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# FastAPI Why Cards

## Parameters

```
/learn:fastapi-why-cards              — 토픽 목록 표시 후 선택
/learn:fastapi-why-cards schema       — Pydantic Schema 카드
/learn:fastapi-why-cards router       — Router / Path Operations 카드
/learn:fastapi-why-cards async        — Async/Await 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `fastapi` |
| Title | `FastAPI Why Cards` |
| Content path | `~/.claude/command-scripts/learn/fastapi-why-cards.md` |
| Language | `Python / FastAPI` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| schema, pydantic, 스키마 | fastapi-schema |
| path, router, 라우터 | fastapi-router |
| dependency, di, 의존성 | fastapi-di |
| middleware, 미들웨어 | fastapi-middleware |
| auth, jwt, oauth2, 인증 | fastapi-auth |
| async, 비동기 | fastapi-async |
| background, 백그라운드 | fastapi-background |
| lifespan, startup, 라이프스팬 | fastapi-lifespan |

## Topic Order

1. fastapi-schema
2. fastapi-router
3. fastapi-di
4. fastapi-middleware
5. fastapi-auth
6. fastapi-async
7. fastapi-background
8. fastapi-lifespan

## Domain Scenario Hints

- Use different class names and different bug patterns
- Concrete artifact: broken code snippet

## Framework Version Notes

- FastAPI 0.100+ / Python 3.11+ 기준
