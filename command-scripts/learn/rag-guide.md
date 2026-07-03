# RAG Guide — Learning Curriculum

## Prerequisites Map

```
chunking-strategy ──→ retrieval-basics
embedding-basics  ──→ vector-store ──→ retrieval-basics
                                            │
                           ┌────────────────┼────────────────┐
                           ▼                ▼                ▼
                      hybrid-search      reranking      multi-query
                           │                │
                           └────────────────┘
                                    │
                           ┌────────┴────────┐
                           ▼                 ▼
                   metadata-filtering   context-budget
                           │
                    evaluation-ragas
                           │
                   hallucination-guard
                           │
                    rag-architecture
```

depth 보강 노드:
```
vector-store ──→ index-internals        (HNSW/IVF/PQ, recall↔latency)
metadata-filtering ──→ schema-design    (payload index 설계)
evaluation-ragas ──→ cost-latency-eval ──→ online-offline-eval
hallucination-guard ──→ citation-grounding
```

## Topics

### Foundation (Week 1)

| ID | Topic | Prerequisites | Key Concept |
|----|-------|--------------|-------------|
| 01 | chunking-strategy | 없음 | 청킹 크기 = 검색 정밀도 vs 맥락 보존 트레이드오프 |
| 02 | embedding-basics | 없음 | 의미 → 벡터 좌표 변환. 유사 의미 = 가까운 좌표 |
| 03 | vector-store | embedding-basics | ANN 인덱스(HNSW). 일반 DB = full scan |
| 15 | index-internals | vector-store | HNSW/IVF/PQ. recall↔latency↔memory 3축 곡선 |

### Core Retrieval (Week 1-2)

| ID | Topic | Prerequisites | Key Concept |
|----|-------|--------------|-------------|
| 04 | retrieval-basics | chunking, vector-store | top-k, similarity threshold, MMR |
| 05 | hybrid-search | retrieval-basics | Dense(의미) + Sparse(키워드). RRF 합산 |
| 06 | reranking | retrieval-basics | Bi-encoder(빠름) → Cross-encoder(정밀) 2단계 |

### Advanced (Week 2-3)

| ID | Topic | Prerequisites | Key Concept |
|----|-------|--------------|-------------|
| 07 | multi-query | retrieval-basics | 쿼리 다양화 → recall 향상. 사용자 표현 ≠ 문서 표현 |
| 08 | metadata-filtering | retrieval-basics | 벡터 검색 전 WHERE 절. 멀티테넌시 필수 |
| 16 | schema-design | metadata-filtering | payload index 설계. 인덱스 없는 필터 = full scan |
| 09 | context-budget | retrieval-basics | Lost in the Middle. k 작게 = 더 정확 |

### Evaluation (Week 3)

| ID | Topic | Prerequisites | Key Concept |
|----|-------|--------------|-------------|
| 10 | evaluation-ragas | retrieval-basics | Faithfulness + Answer Relevance + Context Precision/Recall |
| 17 | cost-latency-eval | evaluation-ragas | quality↔cost↔latency 3축. failure mode 분류 |
| 18 | online-offline-eval | evaluation-ragas | offline=회귀 게이트, online=진실. feedback→gold 환류 |
| 11 | hallucination-guard | evaluation-ragas | NLI 기반 감지 + 가드레일 프롬프트 |
| 19 | citation-grounding | hallucination-guard | claim↔source span 검증. unsupported claim rate |

### Architecture (Week 4)

| ID | Topic | Prerequisites | Key Concept |
|----|-------|--------------|-------------|
| 12 | rag-vs-finetuning | evaluation-ragas | RAG = 지식 외부화. Fine-tuning = 행동 내면화 |
| 13 | indexing-pipeline | chunking, vector-store | 문서 수집 → 전처리 → 청킹 → 임베딩 → 저장 자동화 |
| 14 | rag-architecture | all | Naive RAG → Advanced RAG → Modular RAG 진화 |

## Session Structure

Each topic session follows:

1. **rag-why-cards 연결** — 해당 주제 why card 있으면 2분 복습 (없으면 skip)
2. **핵심 개념** — 동작 원리, 트레이드오프, 언제 쓰는지
3. **코드 실습** — Python/LangChain 직접 작성 (context7로 최신 docs 참조)
4. **퀴즈** — 3-5개 확인 문제
5. **설계 질문** — "실제 시스템에 이 컴포넌트를 붙인다면?" 실전 설계 연습

## Stack (use context7 for latest)

- Python 3.11+
- LangChain 0.3.x / LangGraph
- OpenAI API (`text-embedding-3-small` + `gpt-4o-mini`)
- Chroma (로컬 개발) / pgvector or Qdrant (프로덕션)
- RAGAS (평가)
- sentence-transformers (reranker: `cross-encoder/ms-marco-MiniLM-L-6-v2`)
