---
name: react-why-cards
description: React 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# React Why Cards

## Parameters

```
/learn:react-why-cards              — 토픽 목록 표시 후 선택
/learn:react-why-cards state        — useState 카드
/learn:react-why-cards effect       — useEffect 카드
/learn:react-why-cards rendering    — Virtual DOM/리렌더링 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `react` |
| Title | `React Why Cards` |
| Content path | `~/.claude/command-scripts/learn/react-why-cards.md` |
| Language | `TypeScript / React` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| component, 컴포넌트 | react-components |
| state, usestate, 상태 | react-state |
| effect, useeffect, 사이드이펙트 | react-effects |
| rendering, vdom, 리렌더링 | react-rendering |
| props, 단방향 | react-props |
| context, usecontext | react-context |
| memo, usememo, usecallback | react-memo |
| hooks, 커스텀훅 | react-hooks |

## Topic Order

1. react-components
2. react-state
3. react-effects
4. react-rendering
5. react-props
6. react-context
7. react-memo
8. react-hooks

## Domain Scenario Hints

- Use different component names and different bug patterns
- Concrete artifact: broken code snippet

## Framework Version Notes

- React 18 / TypeScript 기준
