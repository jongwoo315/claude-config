---
name: spring-data-pipeline-why-cards
description: Spring Batch/Kafka 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Spring Data Pipeline Why Cards

## Parameters

```
/learn:spring-data-pipeline-why-cards              — 토픽 목록 표시 후 선택
/learn:spring-data-pipeline-why-cards chunk        — Batch 청킹 카드
/learn:spring-data-pipeline-why-cards kafka        — Kafka vs Queue 카드
/learn:spring-data-pipeline-why-cards offset       — Offset 커밋 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `spring-data-pipeline` |
| Title | `Spring Data Pipeline Why Cards` |
| Content path | `~/.claude/command-scripts/learn/spring-data-pipeline-why-cards.md` |
| Language | `Java / Spring Batch` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| chunk, 청킹, batch-chunk | batch-chunk |
| restart, 재시작 | batch-restart |
| skip, 건너뜀 | batch-skip |
| kafka, kafka-vs-queue, 카프카 | kafka-vs-queue |
| group, consumer-group, 컨슈머그룹 | consumer-group |
| offset, 오프셋 | offset-commit |
| dlq, dead letter | kafka-dlq |

## Topic Order

1. batch-chunk
2. batch-restart
3. batch-skip
4. kafka-vs-queue
5. consumer-group
6. offset-commit
7. kafka-dlq

## Domain Scenario Hints

- Use different class names and different bug patterns
- Concrete artifact: broken code snippet or system description

## Framework Version Notes

- Spring Batch 5.x + Spring Kafka 3.x 기준
- learn:spring-data-pipeline-guide 학습 전/후 복습용으로 활용
