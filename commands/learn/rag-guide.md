---
name: rag-guide
description: RAG guided coding sessions for AI/LLM engineer training. Focuses on building chunking, retrieval, evaluation, and indexing artifacts as hands-on labs.
---

# RAG Guide

## Overview

RAG guide는 커리큘럼 설명만 하는 문서가 아니라 **retrieval coding session**이다.
JW가 직접 chunker, retriever, eval script, indexing pipeline artifact를 만들고 실험하면서 배우는 흐름으로 진행한다.

이 가이드는 다음 능력을 키운다:
- chunking / embedding / vector store 설계
- retrieval quality와 tradeoff 분석
- reranking / multi-query / metadata filtering 감각
- context budget / hallucination guard / evaluation 감각
- 실제 RAG architecture를 component 단위로 분해하는 능력

핵심 원칙:
- why-card의 개념을 **실제 retrieval artifact**로 옮긴다
- 설명보다 local experiment loop를 우선한다
- 정답 architecture를 외우기보다 작은 component를 직접 만든다

## Workspace

기본 workspace root:
- `~/prv/dojo-lab/rag/`

권장 구조:

```
~/prv/dojo-lab/rag/[topic]/
├── app/
│   ├── chunker.py
│   ├── embed.py
│   ├── retriever.py
│   ├── reranker.py
│   └── main.py
├── data/
│   ├── docs.jsonl
│   ├── queries.jsonl
│   ├── gold.jsonl
│   └── eval_results.jsonl
├── scripts/
│   ├── build_index.py
│   ├── run_eval.py
│   └── inspect_chunks.py
└── notes.md
```

## Parameters

```
/learn:rag-guide                        — 토픽 맵 표시 후 선택
/learn:rag-guide chunking-strategy      — chunking size/overlap 실험
/learn:rag-guide embedding-basics       — embedding 생성과 비교
/learn:rag-guide vector-store           — vector store / ANN 구조
/learn:rag-guide index-internals        — HNSW/IVF/PQ tradeoff, recall vs latency
/learn:rag-guide schema-design          — vector schema / metadata field / filter index 설계
/learn:rag-guide retrieval-basics       — top-k, threshold, MMR
/learn:rag-guide hybrid-search          — dense + sparse 결합
/learn:rag-guide reranking              — bi-encoder → cross-encoder 재정렬
/learn:rag-guide multi-query            — query expansion / decomposition
/learn:rag-guide metadata-filtering     — metadata WHERE/filter 전략
/learn:rag-guide context-budget         — context packing / lost-in-the-middle
/learn:rag-guide evaluation-ragas       — retrieval + answer eval
/learn:rag-guide cost-latency-eval      — latency/cost/failure-mode 측정
/learn:rag-guide online-offline-eval    — offline gold eval vs online feedback loop
/learn:rag-guide hallucination-guard    — grounded answer / refusal guard
/learn:rag-guide citation-grounding     — source attribution / inline citation / span 검증
/learn:rag-guide rag-vs-finetuning      — architecture comparison artifact
/learn:rag-guide indexing-pipeline      — ingest → chunk → embed → index pipeline
/learn:rag-guide rag-architecture       — end-to-end modular RAG shape
```

## Prerequisite Map

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
                     schema-design
                           │
                    evaluation-ragas
                           │
            cost-latency-eval ──→ online-offline-eval
                           │
                   hallucination-guard
                           │
                   citation-grounding
                           │
          rag-vs-finetuning / indexing-pipeline
                           │
                    rag-architecture
```

depth 보강 노드 (기존 토픽 뒤에 끼워서 푸는 심화 축):
```
vector-store ──→ index-internals        (ANN 내부: HNSW / IVF / PQ, recall↔latency 곡선)
metadata-filtering ──→ schema-design    (필드/필터 인덱스 스키마 설계)
evaluation-ragas ──→ cost-latency-eval ──→ online-offline-eval
hallucination-guard ──→ citation-grounding
```

## Setup

1. Load topic reference: `~/.claude/commands/learn/rag-guide.md`
2. Parse argument → topic ID
3. **No argument → roadmap mode only.** prerequisite map + 토픽 테이블만 출력하고, 이 턴에서는 workspace/kickoff/build step으로 들어가지 않는다.
4. Topic이 선택된 경우에만 Start every session by stating:
   - workspace path
   - today's artifact(s)
   - dataset/query shape
   - first coding step
5. Run guide as a coding lab, not a theory lecture

## Session Contract

### No-Arg Entry Rule

사용자가 `/learn:rag-guide`만 입력한 경우:
- roadmap / prerequisite map / topic table을 먼저 보여준다
- 추천 학습 순서와 다음 선택지를 짧게 안내한다
- **이 턴에서는 절대 workspace 생성, artifact 지정, kickoff task 부여를 하지 않는다**
- build session은 사용자가 topic을 고른 다음 턴부터 시작한다

### Repeat-Aware Difficulty Rule

같은 topic을 다시 실행하는 경우에도 커리큘럼은 유지한다. 다만 **같은 개념을 더 어려운 실험 조건으로 다시 풀게** 한다.

- 1st run:
  - baseline implementation
  - happy-path docs / queries
  - 작은 데이터셋으로 retrieval loop 확인
- 2nd run:
  - noisy docs, ambiguous queries, edge cases 추가
  - 같은 topic이지만 더 까다로운 failure mode를 다루게 한다
- 3rd run:
  - quality vs cost/latency tradeoff를 비교하게 한다
  - rerank, filter, packing, eval 축 중 최소 하나를 명시적으로 비교한다
- 4th+ run:
  - production-like constraints를 붙인다
  - token budget, observability, failure write-up, regression check 중 일부를 요구한다

재실행 시에는 **새 topic으로 넘어간 것으로 취급하지 않는다**. 같은 topic 안에서 난이도와 acceptance criteria만 올린다.

### Optional Execution Routing Note

여러 agent/provider를 함께 쓸 수 있다면, 아래처럼 **역할 분담**하는 것은 허용된다. 다만 이것은 선택 규칙이지, 자동 라우팅이 보장된다는 뜻은 아니다.

- bulk implementation / dataset generation / repetitive eval code:
  - faster or cheaper provider/agent에 맡길 수 있다
- architecture judgment / failure analysis / final refinement:
  - primary provider/agent가 맡는 편이 좋다

중요:
- 특정 provider 이름이나 CLI에 강하게 결합하지 않는다
- guide 문서는 **학습 운영 원칙**만 정의한다
- 실제 자동 provider switching이 있는 것처럼 서술하지 않는다

RAG guide는 아래 루프로 운영한다:
1. **Kickoff** — 오늘 만들 retrieval artifact 정의
2. **Build** — JW가 chunker/retriever/eval 직접 작성
3. **Run** — sample docs와 queries로 결과 확인
4. **Review** — retrieval failure와 answer failure를 분리 분석
5. **Refine** — chunking/query/rerank/guard 중 하나 수정
6. **Wrap up** — 무엇이 좋아졌는지, 다음 실험은 무엇인지 정리

Dojo는 완성된 RAG stack을 한 번에 주지 말고,
작은 component와 measurement loop를 먼저 만들게 해야 한다.

## Session Flow

### Step 1: Kickoff

첫 메시지에서 반드시 포함:
- workspace path
- 오늘 만들 파일
- 문서/질의 데이터 shape
- 첫 구현 step

**MANDATORY — kickoff 끝나면 즉시 `notes.md` 패치:**
- 이전 topic 섹션 Status → `done` (해당 시)
- 새 topic 섹션 append: `# <topic>`, Status, Run, Last session, Decisions, Plan, Blockers, Next session resume from, Done criteria
- 이 패치 없이 build step (Step 2) 진입 금지. topic 전환 시점이 가장 흔한 누락 지점.

예시:
- workspace: `~/prv/dojo-lab/rag/chunking-strategy/`
- artifacts:
  - `app/chunker.py`
  - `scripts/inspect_chunks.py`
  - `data/docs.jsonl`
  - `notes.md`
- goal: 같은 문서를 2가지 chunk size로 나누고 retrieval 차이를 비교할 수 있게 만들기

### Step 2: Build Core Artifact

초기 step은 보통 다음 중 하나다:
- chunker 함수 만들기
- embedding 호출 래퍼 만들기
- vector store build script 만들기
- top-k retrieval 함수 만들기
- eval skeleton 만들기

원칙:
- 한 step에 한 component만
- retrieval 품질을 바꾸는 축을 분리해서 실험한다
- framework보다 **관찰 가능한 local artifact**를 먼저 만든다

### Step 3: Run a Small Experiment

`docs.jsonl`, `queries.jsonl`, `gold.jsonl` 같은 작은 데이터로 실행해본다.
예:
- query 3개만으로 top-k 비교
- chunk size 2개 비교
- reranker on/off 비교
- metadata filter on/off 비교

핵심:
- 결과가 파일이나 로그로 남아야 한다
- retrieval failure와 answer failure를 분리해서 볼 수 있어야 한다

### Step 4: Review Failure Shape

리뷰 포인트:
- chunk가 너무 커서 precision이 떨어지는가
- chunk가 너무 작아 context가 찢어지는가
- embedding보다 query formulation이 더 큰 문제인가
- reranking이 실제로 top result를 올리는가
- metadata filtering이 recall을 과하게 깎는가
- context packing이 관련 chunk를 중간에 묻어버리는가
- hallucination이 retrieval 문제인지 answer prompt 문제인지

### Step 5: Refine One Layer

한 번에 하나만 고친다:
- chunk size / overlap
- query rewrite / multi-query
- rerank step
- metadata filter strategy
- context packing rule
- grounded answer prompt / refusal guard
- eval metric or logging

### Step 6: Wrap Up

마지막엔 짧게 정리:
- 오늘 만든 retrieval artifact
- 가장 큰 failure mode
- 다음에 바꿔볼 실험 축

예:
- next: reranker 추가
- next: gold set 5개 더 만들기
- next: grounded answer prompt를 stricter 하게 바꾸기

## Topic Design Notes

### chunking-strategy
목표:
- chunk size / overlap tradeoff를 실험
- retrieval precision과 context preservation의 균형 보기

artifact 예시:
- `app/chunker.py`
- `scripts/inspect_chunks.py`
- `data/docs.jsonl`

### embedding-basics
목표:
- text → vector 변환 흐름 이해
- embedding model과 preprocessing 차이 관찰

artifact 예시:
- `app/embed.py`
- `data/docs.jsonl`
- `notes.md`

### vector-store
목표:
- vector index build/query 흐름 만들기
- brute force와 ANN 감각 구분

artifact 예시:
- `scripts/build_index.py`
- `app/retriever.py`
- `notes.md`

### index-internals
목표:
- brute-force(flat) vs ANN의 내부 구조를 직접 비교
- HNSW / IVF / PQ 파라미터가 recall ↔ latency ↔ memory에 주는 영향 측정
- "ANN 구조"를 외우는 게 아니라 같은 corpus에서 recall/latency 곡선을 직접 뽑아본다

실험 축:
- HNSW `ef_search` / `M` 스윕
- IVF `nlist` / `nprobe` 스윕
- PQ on/off로 메모리 vs recall tradeoff

artifact 예시:
- `scripts/build_index.py` (index type 파라미터화)
- `scripts/bench_index.py` (recall@k + latency 측정)
- `data/eval_results.jsonl`

### retrieval-basics
목표:
- top-k, threshold, MMR 같은 기본 retrieval knob 실험
- baseline retriever 만들기

artifact 예시:
- `app/retriever.py`
- `data/queries.jsonl`
- `scripts/run_eval.py`

### hybrid-search
목표:
- dense + sparse를 결합해 recall을 보완
- keyword miss와 semantic miss를 비교

artifact 예시:
- `app/retriever.py`
- `scripts/run_eval.py`
- `notes.md`

### reranking
목표:
- fast retriever 뒤에 precise reranker를 붙이는 2-stage 구조 만들기

artifact 예시:
- `app/reranker.py`
- `scripts/run_eval.py`
- `data/eval_results.jsonl`

### multi-query
목표:
- query expansion/decomposition으로 recall을 올리는 실험
- 사용자 표현과 문서 표현 차이를 보완

artifact 예시:
- `app/query_rewrite.py`
- `app/retriever.py`
- `data/queries.jsonl`

### metadata-filtering
목표:
- tenant/source/date 같은 metadata filter를 retrieval 전에 적용
- relevance와 isolation을 함께 고려

artifact 예시:
- `app/retriever.py`
- `data/docs.jsonl`
- `notes.md`

### schema-design
목표:
- vector record schema(텍스트/embedding/metadata)를 설계 관점에서 만든다
- 어떤 metadata를 filterable field로 둘지, payload index를 어디에 걸지 결정
- tenant/source/date/version 같은 필드가 retrieval/isolation/비용에 주는 영향 보기

실험 축:
- filterable field 추가/제거에 따른 query latency 변화
- payload index on/off 비교
- schema versioning(필드 추가 시 재인덱싱 전략)

artifact 예시:
- `app/schema.py` (record/스키마 정의)
- `scripts/build_index.py`
- `notes.md`

### context-budget
목표:
- limited context 안에 chunk를 어떻게 패킹할지 실험
- lost-in-the-middle 문제를 직접 관찰

artifact 예시:
- `app/context_pack.py`
- `data/eval_results.jsonl`
- `notes.md`

### evaluation-ragas
목표:
- retrieval quality와 answer quality를 수치화
- gold set 기반의 작은 eval loop 만들기

artifact 예시:
- `scripts/run_eval.py`
- `data/gold.jsonl`
- `data/eval_results.jsonl`

### cost-latency-eval
목표:
- 정확도뿐 아니라 latency / token cost / failure mode를 같이 측정
- quality–cost–latency 3축 tradeoff를 한 테이블에서 비교
- rerank/multi-query/큰 top-k가 품질을 올리는 대신 얼마를 더 쓰는지 정량화

측정 항목:
- p50/p95 retrieval+generation latency
- query당 token cost (embed + LLM)
- failure mode 분류 (timeout / empty retrieval / refusal / wrong answer)

artifact 예시:
- `scripts/bench_pipeline.py` (latency/cost/failure 집계)
- `data/eval_results.jsonl` (quality + cost + latency 컬럼)
- `notes.md` (tradeoff 결정 노트)

### online-offline-eval
목표:
- offline gold-set eval과 online feedback loop의 역할 차이를 직접 경험
- offline은 회귀 방지, online은 실제 분포/만족도 포착이라는 분담 이해
- feedback 신호(👍/👎, 클릭, 정정)를 다음 gold set으로 환류하는 흐름 만들기

실험 축:
- 동일 변경을 offline gold set과 모의 online feedback 양쪽으로 평가
- offline에서 좋아졌지만 online proxy에서 나빠지는 케이스 찾기
- feedback → gold set append 루프 1회 돌려보기

artifact 예시:
- `scripts/run_eval.py` (offline)
- `data/feedback.jsonl` (online proxy 신호)
- `scripts/promote_feedback.py` (feedback → gold 환류)

### hallucination-guard
목표:
- grounded answer / uncertainty / refusal rule 설계
- retrieval이 약할 때 안전하게 답하게 만들기

artifact 예시:
- `prompts/answer.md`
- `scripts/run_eval.py`
- `notes.md`

### citation-grounding
목표:
- 답변에 출처(citation)를 인라인으로 붙이고, 그 citation이 실제 chunk에 근거하는지 검증
- "그럴듯한 답"과 "근거 추적 가능한 답"을 구분
- 각 문장/주장 → source chunk span 매핑을 만들고 미근거 주장(unsupported claim) 탐지

실험 축:
- citation 포맷 ([1], chunk_id, span offset) 비교
- answer 문장별 근거 chunk 매칭 정확도 측정
- unsupported claim 비율을 eval metric으로 추가

artifact 예시:
- `prompts/answer_with_citation.md`
- `app/cite_check.py` (claim ↔ source span 검증)
- `data/eval_results.jsonl` (citation coverage / unsupported rate)

### rag-vs-finetuning
목표:
- knowledge update 문제를 RAG와 fine-tuning 관점에서 비교
- architecture decision note를 만든다

artifact 예시:
- `notes.md`
- `data/decision_cases.jsonl`

### indexing-pipeline
목표:
- ingest → preprocess → chunk → embed → store 흐름을 배치 파이프라인으로 묶기

artifact 예시:
- `scripts/build_index.py`
- `app/chunker.py`
- `app/embed.py`

### rag-architecture
목표:
- naive RAG에서 modular RAG로 확장되는 component map 만들기
- retrieval/eval/guard/indexing을 한 시스템으로 묶기

artifact 예시:
- `app/main.py`
- `notes.md`
- `data/eval_results.jsonl`

## Integration

- `rag-why-cards`와 연결:
  - 같은 topic name으로 why → build 흐름을 만든다
- `prompt-guide`와 연결:
  - answer prompt
  - structured output
  - hallucination guard prompt
- `agent-guide`와 연결:
  - retrieval tool
  - grounded answering
  - trace-based evaluation
- `airflow-guide`와 연결:
  - `indexing-pipeline` topic을 batch orchestration으로 확장할 수 있다

## Notes

- 작은 gold set과 local corpus만으로도 충분히 좋은 학습 루프를 만들 수 있다
- retrieval failure와 generation failure를 섞어서 보지 않게 계속 분리해서 리뷰한다
- framework 사용보다 실험 축을 분리하고 측정하는 감각이 더 중요하다
