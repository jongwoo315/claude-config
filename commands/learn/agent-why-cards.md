---
name: agent-why-cards
description: 에이전트 패턴 / LangGraph 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). AI 엔지니어 면접 대비. 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Agent Why Cards

## Parameters

```
/learn:agent-why-cards                  — 토픽 목록 표시 후 선택
/learn:agent-why-cards react            — ReAct 루프 카드
/learn:agent-why-cards tool-use         — Tool use / 함수 호출 카드
/learn:agent-why-cards langgraph        — LangGraph 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `agent` |
| Title | `Agent Why Cards` |
| Content path | `~/.claude/command-scripts/learn/agent-why-cards.md` |
| Language | `Python / LangChain / LangGraph` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| react, ReAct, 리액트루프 | react-loop |
| tool, tool-use, function, 툴, 함수호출 | tool-use |
| planning, plan, mrkl, 플래닝 | planning |
| memory, 메모리, 기억 | agent-memory |
| langgraph, graph, 그래프 | langgraph |
| multi, multi-agent, 멀티에이전트 | multi-agent |
| failure, fail, loop, 실패, 무한루프 | agent-failures |
| reflexion, reflect, self-critique, 자기비평 | reflexion |

## Topic Order

1. react-loop
2. tool-use
3. planning
4. agent-memory
5. langgraph
6. multi-agent
7. agent-failures
8. reflexion

## Domain Scenario Hints

- Use a different system name and a different bug pattern
- Concrete artifact: broken agent code or architecture

## Framework Version Notes

- AI 엔지니어 면접 커버리지 기준
