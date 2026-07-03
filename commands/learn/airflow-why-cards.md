---
name: airflow-why-cards
description: Apache Airflow 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). AI 엔지니어 면접 대비. 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# Airflow Why Cards

## Parameters

```
/learn:airflow-why-cards              — 토픽 목록 표시 후 선택
/learn:airflow-why-cards dag          — DAG 구조 카드
/learn:airflow-why-cards operator     — Operator 카드
/learn:airflow-why-cards trigger-rule — Trigger Rule 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `airflow` |
| Title | `Airflow Why Cards` |
| Content path | `~/.claude/command-scripts/learn/airflow-why-cards.md` |
| Language | `Python / Airflow DAG` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| dag, dag구조, 다그 | dag-structure |
| operator, 오퍼레이터 | operator |
| trigger, trigger-rule, 트리거룰 | trigger-rule |
| sensor, 센서 | sensor |
| xcom, 엑스컴, task data | xcom |
| retry, 재시도 | retry |
| backfill, 백필, 재처리 | backfill |

## Topic Order

1. dag-structure
2. operator
3. trigger-rule
4. sensor
5. xcom
6. retry
7. backfill

## Domain Scenario Hints

- Use different pipeline names and different bug patterns
- Concrete artifact: broken code snippet or system description
- LLM 파이프라인 오케스트레이션 관점에서 설명

## Framework Version Notes

- Airflow 2.x 기준
