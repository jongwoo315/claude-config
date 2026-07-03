---
name: rag-why-cards
description: RAG 파이프라인 통근용 개념 카드 — Why Story (왜 존재하는가) + What Breaks (없으면 어떻게 깨지나). AI 엔지니어 면접 대비. 짧고 모바일 친화적.
---

**MANDATORY:** Load `~/.claude/commands/learn/_why-cards-common.md` BEFORE responding to any why-card trigger. Rules below ADD to that file; they do not replace it. If you reply without loading the common spec, discard and rewrite from scratch.

# RAG Why Cards

## Parameters

```
/learn:rag-why-cards                  — 토픽 목록 표시 후 선택
/learn:rag-why-cards chunking         — 청킹 전략 카드
/learn:rag-why-cards embedding        — 임베딩 기초 카드
/learn:rag-why-cards eval             — RAG 평가 카드
```

## Slots

| Slot | Value |
|------|-------|
| Namespace | `rag` |
| Title | `RAG Why Cards` |
| Content path | `~/.claude/command-scripts/learn/rag-why-cards.md` |
| Language | `Python / LangChain / LlamaIndex / embeddings` |

## Trigger Aliases

| Input | Topic ID |
|-------|----------|
| chunking, 청킹, chunk | chunking-strategy |
| embedding, 임베딩, embed | embedding-basics |
| vector, vectorstore, 벡터 | vector-store |
| retrieval, 검색, retrieve | retrieval |
| hybrid, 하이브리드 | hybrid-search |
| rerank, 리랭킹, reranking | reranking |
| multiquery, multi, 멀티쿼리 | multi-query |
| context, budget, 컨텍스트 | context-budget |
| eval, evaluation, ragas, 평가 | evaluation-ragas |
| cost, latency, 비용, 지연 | cost-latency-eval |
| online, offline, feedback, 피드백 | online-offline-eval |
| finetune, finetuning, rag vs, 파인튜닝 | rag-vs-finetuning |
| hallucination, 환각 | hallucination |
| citation, grounding, 출처, 인용 | citation-grounding |
| metadata, filter, 필터 | metadata-filtering |
| index, hnsw, ivf, ann, 인덱스 | index-internals |
| schema, 스키마, payload | schema-design |

## Topic Order

1. chunking-strategy
2. embedding-basics
3. vector-store
4. index-internals
5. retrieval
6. hybrid-search
7. reranking
8. multi-query
9. context-budget
10. metadata-filtering
11. schema-design
12. evaluation-ragas
13. cost-latency-eval
14. online-offline-eval
15. rag-vs-finetuning
16. hallucination
17. citation-grounding

## Domain Scenario Hints

- Use a different system name and a different bug pattern
- Concrete artifact: broken code snippet or architecture decision

## Framework Version Notes

- AI 엔지니어 면접 커버리지 기준
