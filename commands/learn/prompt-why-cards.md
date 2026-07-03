---
name: prompt-why-cards
description: 프롬프트 엔지니어링 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). AI 엔지니어 면접 대비. 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Prompt Why Cards

## Parameters

```
/learn:prompt-why-cards                 — 토픽 목록 표시 후 선택
/learn:prompt-why-cards system          — System Prompt 카드
/learn:prompt-why-cards few-shot        — Few-shot prompting 카드
/learn:prompt-why-cards cot             — Chain-of-Thought 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `prompt` |
| Title | `Prompt Why Cards` |
| Content path | `~/.claude/command-scripts/learn/prompt-why-cards.md` |
| Language | `Python / OpenAI SDK / LangChain` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| system, system-prompt, 시스템프롬프트 | system-prompt |
| role, persona, 롤, 페르소나 | role-prompting |
| few-shot, fewshot, 퓨샷 | few-shot |
| cot, chain, chain-of-thought, 사고과정 | chain-of-thought |
| zero-shot, zeroshot, 제로샷 | zero-shot-cot |
| structured, json, output, 구조화 | structured-output |
| temperature, temp, sampling, 온도 | temperature |
| injection, security, 인젝션 | prompt-injection |

## Topic Order

1. system-prompt
2. role-prompting
3. few-shot
4. chain-of-thought
5. zero-shot-cot
6. structured-output
7. temperature
8. prompt-injection

## Domain Scenario Hints

- Use a different system name and a different bug pattern
- Concrete artifact: broken prompt or code snippet

## Framework Version Notes

- AI 엔지니어 면접 커버리지 기준
