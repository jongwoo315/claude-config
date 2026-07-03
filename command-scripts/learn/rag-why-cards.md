# RAG Why Cards — Content Database

---

## chunking-strategy — 청킹 전략 (Text Chunking)

### Why Story

1000페이지 PDF를 GPT에 통째로 넣으면? `context length exceeded`. 그렇다고 너무 작게 자르면? 문맥이 끊겨서 답변이 이상해짐.

청킹 = 문서를 검색 가능한 조각으로 쪼개는 전략. 어떻게 자르느냐가 검색 품질을 결정한다.

**Fixed-size chunking:** 무지성으로 500자씩 자름.
```python
text_splitter = CharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = text_splitter.split_text(document)
```
문장 중간에서 잘릴 수 있음. "결론적으로 이 기술은..." → 앞 문맥 없이 검색됨.

**Recursive chunking:** 문단 → 문장 → 단어 순서로 분할 시도. LangChain 기본값.
```python
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=500,
    chunk_overlap=50,
    separators=["\n\n", "\n", " ", ""]
)
```

**Semantic chunking:** 의미 단위로 분할. 임베딩 유사도 급변 지점에서 자름. 가장 정교하지만 느림.

**overlap의 역할:** `chunk_overlap=50` → 경계 문장이 양쪽 청크에 포함됨. 경계 맥락 손실 방지.

🧠 핵심 멘탈 모델: **청킹 크기 = 검색 정밀도 vs 맥락 보존의 트레이드오프**

### 💥 What Breaks Without It?

```python
# overlap=0, chunk_size=200으로 자른 계약서
chunk_1 = "...제3조 갑은 을에게 서비스를 제공한다. 단,"
chunk_2 = "계약 해지 시 위약금은 없다. 제4조..."
```

→ "위약금 조항 있나요?" 질문 시 `chunk_2`만 검색됨. "단," 이후 내용(실제 조건)이 `chunk_1` 끝에 있는데 잘림. LLM이 틀린 답변 생성.

---

## embedding-basics — 임베딩 기초 (Text Embeddings)

### Why Story

"강아지 관련 법률"을 검색하고 싶다. 문서엔 "반려동물 규정"이라고 적혀있다. 키워드 검색으론 못 찾는다.

임베딩 = 텍스트를 의미를 담은 숫자 벡터로 변환.

```python
from openai import OpenAI
client = OpenAI()

response = client.embeddings.create(
    model="text-embedding-3-small",
    input="강아지 관련 법률"
)
vector = response.data[0].embedding  # 길이 1536짜리 float 배열
```

의미적으로 유사한 텍스트 → 벡터 공간에서 가까운 위치.

```
"강아지 관련 법률"  →  [0.23, -0.41, 0.87, ...]
"반려동물 규정"     →  [0.21, -0.39, 0.85, ...]  ← 가까움!
"자동차 엔진 오일"  →  [-0.91, 0.12, -0.44, ...] ← 멈
```

유사도 측정: **cosine similarity** (방향 유사성, 크기 무관)

```python
from numpy import dot
from numpy.linalg import norm

def cosine_sim(a, b):
    return dot(a, b) / (norm(a) * norm(b))
```

🔑 임베딩 모델 선택이 중요: `text-embedding-3-small` (OpenAI), `bge-m3` (다국어 강함), `ko-sroberta` (한국어 특화)

🧠 핵심 멘탈 모델: **임베딩 = 의미를 좌표로 변환. 유사한 의미 = 가까운 좌표.**

### 💥 What Breaks Without It?

```python
# BM25 키워드 검색
query = "ML model deployment best practices"
docs = search_by_keyword(query)
# 문서엔 "머신러닝 서빙 운영 노하우"라고 적혀있음 → 0개 결과
```

→ 의역, 번역, 동의어 전부 실패. 사용자가 영어로 물어봐도 한국어 문서 검색 불가. 임베딩 없이는 다국어 RAG 불가능.

---

## vector-store — 벡터 DB (Vector Database)

### Why Story

임베딩 벡터를 어디에 저장할까? PostgreSQL에 저장하고 유사도 검색하면?

```sql
-- 이렇게 하면 안 됨
SELECT id, (embedding <=> query_vec) AS dist
FROM documents
ORDER BY dist
LIMIT 5;
-- 100만 개 벡터 × 1536차원 = 전부 계산 → 수십 초
```

벡터 DB = **근사 최근접 이웃 (ANN) 인덱스** 탑재. 정확도 조금 희생, 속도 1000배 향상.

**주요 알고리즘: HNSW (Hierarchical Navigable Small World)**
- 계층적 그래프 구조로 벡터 인덱싱
- O(n) brute force → O(log n) approximate search
- 100만 벡터: 수십 초 → 수 ms

**선택지:**

| 옵션 | 특징 |
|------|------|
| **Chroma** | 로컬 개발용, 설치 간단 |
| **pgvector** | 기존 PostgreSQL에 추가, HNSW 지원 |
| **Pinecone** | 관리형 클라우드, 프로덕션 |
| **Qdrant** | 오픈소스, 필터링 강함 |
| **FAISS** | Meta 오픈소스, 메모리 내 |

```python
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=OpenAIEmbeddings(),
    persist_directory="./chroma_db"
)

results = vectorstore.similarity_search("강아지 법률", k=3)
```

🧠 핵심 멘탈 모델: **벡터 DB = ANN 인덱스 탑재한 특수 DB. 일반 DB에 벡터 넣으면 full scan.**

### 💥 What Breaks Without It?

```python
# SQLite에 벡터 저장 후 검색
import sqlite3, numpy as np

conn = sqlite3.connect("docs.db")
rows = conn.execute("SELECT id, embedding FROM documents").fetchall()

# 100만 건 전부 메모리에 로드 후 계산
query_vec = embed("사용자 질문")
scores = [(id, cosine_sim(np.frombuffer(emb), query_vec)) for id, emb in rows]
scores.sort(key=lambda x: -x[1])
```

→ 100만 문서: ~30초 latency. 메모리 6GB+ 사용. 동시 요청 처리 불가. 프로덕션 배포 불가.

---

## retrieval — 검색 전략 (Retrieval)

### Why Story

top-k=3으로 검색하면 끝일까? 아니다. 관련 문서가 4번째에 있을 수 있다. 3개가 전부 같은 문서의 다른 청크일 수 있다.

**기본 similarity search의 한계:**
```python
results = vectorstore.similarity_search(query, k=3)
# 문제: 비슷한 청크 3개 → 다양한 관점 없음
```

**MMR (Maximal Marginal Relevance):** 관련성 + 다양성 균형
```python
results = vectorstore.max_marginal_relevance_search(
    query, k=3, fetch_k=20, lambda_mult=0.5
)
# fetch_k=20개 후보 중 관련성 높으면서 서로 다른 3개 선택
# lambda_mult: 0=다양성 최대, 1=관련성만
```

**Contextual Compression:** 청크 전체 대신 관련 부분만 추출
```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import LLMChainExtractor

compressor = LLMChainExtractor.from_llm(llm)
retriever = ContextualCompressionRetriever(
    base_retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    base_compressor=compressor
)
# 5개 청크 검색 → 각 청크에서 관련 문장만 추출 → LLM에 전달
```

🧠 핵심 멘탈 모델: **검색 = 후보 확보(k 크게) + 정제(압축/다양화). top-3 그대로 쓰는 건 naive.**

### 💥 What Breaks Without It?

```python
# 300페이지 기술 문서를 500자 청킹
# 쿼리: "트랜잭션 격리 수준 설명해줘"
results = vectorstore.similarity_search(query, k=3)
# 결과: 동일 섹션의 chunk_1, chunk_2, chunk_3
# SERIALIZABLE 격리 수준 내용은 chunk_7에 있음 → 누락
```

→ LLM이 READ COMMITTED, REPEATABLE READ만 설명하고 SERIALIZABLE 누락. 사용자는 답변이 불완전한지 모름.

---

## hybrid-search — 하이브리드 검색 (Hybrid Search)

### Why Story

Dense 검색(임베딩)만 쓰면 어떤 문제? "GPT-4o" 검색 시 "GPT-4"나 "ChatGPT" 문서도 높은 점수로 검색됨. 정확한 제품명 매칭에 약하다.

**Dense (임베딩):** 의미 유사성 강함, exact match 약함
**Sparse (BM25/TF-IDF):** exact match 강함, 의미 유사성 약함

```
쿼리: "GPT-4o API 호출 방법"

Dense 결과:      Sparse(BM25) 결과:
1. GPT-4 튜토리얼    1. GPT-4o 공식 문서    ← 정확
2. Claude API 가이드  2. GPT-4o 릴리즈 노트  ← 정확
3. LLM 비교표        3. OpenAI Python SDK   ← 관련
```

**RRF (Reciprocal Rank Fusion):** 두 결과 합산
```python
def rrf_score(rank, k=60):
    return 1 / (k + rank)

# Dense rank 2 + Sparse rank 1
combined_score = rrf_score(2) + rrf_score(1)  # 더해서 재정렬
```

```python
# LangChain EnsembleRetriever
from langchain.retrievers import EnsembleRetriever, BM25Retriever

bm25_retriever = BM25Retriever.from_documents(docs)
dense_retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

ensemble = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.4, 0.6]  # sparse 40%, dense 60%
)
```

🧠 핵심 멘탈 모델: **Dense = 의미, Sparse = 키워드. 둘 다 필요. 각자 못하는 영역이 있음.**

### 💥 What Breaks Without It?

```python
# Dense only RAG, 법률 문서 시스템
query = "제374조 2항 적용 여부"
results = vectorstore.similarity_search(query)
# → "제374조"라는 정확한 조문 찾는 게 아니라 "유사한 법률 내용" 검색
# → 다른 조문이 top-3에 들어올 수 있음
```

→ 법조문 번호, 제품 시리얼, 코드 스니펫, 고유명사처럼 정확 매칭이 필요한 도메인에서 실패.

---

## reranking — 리랭킹 (Reranking)

### Why Story

1차 검색(ANN)은 빠르지만 정밀도가 떨어진다. 1000만 벡터 중 top-50 후보를 빠르게 뽑는 것까지는 잘 한다. 근데 이 50개 중 진짜 best 3는?

**Bi-encoder (임베딩):** query 벡터, doc 벡터를 따로 만들어 dot product
- 장점: 미리 인덱싱 가능, 빠름
- 단점: query-doc interaction 반영 안 됨

**Cross-encoder (reranker):** query + doc를 동시에 처리
```python
# query와 doc를 함께 BERT에 넣어서 관련도 점수 출력
score = cross_encoder.predict([query, doc])  # 0~1
```
- 장점: query-doc 상호작용 반영, 정밀
- 단점: 느림 (모든 쌍에 대해 forward pass 필요) → 1차 필터링 후에만 사용

```python
from sentence_transformers import CrossEncoder

reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

# 1단계: ANN으로 top-50 후보 빠르게 검색
candidates = vectorstore.similarity_search(query, k=50)

# 2단계: cross-encoder로 정밀 재정렬
pairs = [[query, doc.page_content] for doc in candidates]
scores = reranker.predict(pairs)

# top-3 선택
ranked = sorted(zip(scores, candidates), reverse=True)
final_docs = [doc for _, doc in ranked[:3]]
```

🧠 핵심 멘탈 모델: **검색 = 2단계. 1단계(ANN): 빠른 후보 확보. 2단계(reranker): 정밀 재정렬.**

### 💥 What Breaks Without It?

```python
# Reranker 없이 top-3 바로 사용
results = vectorstore.similarity_search("데이터베이스 인덱스 설계 원칙", k=3)
# ANN이 반환한 top-3:
# 1. "인덱스 생성 SQL 문법" (높은 코사인 유사도)
# 2. "인덱스 종류 목록"
# 3. "인덱스 삭제 방법"
# 실제로 가장 관련 있는 "복합 인덱스 설계 원칙과 trade-off"는 top-5에 있었음
```

→ 사용자 질문에 정말 잘 맞는 문서가 ANN score 기준으론 밀려있음. Reranker가 있었다면 1위로 올라왔을 것.

---

## multi-query — 멀티쿼리 검색 (Multi-Query Retrieval)

### Why Story

사용자 쿼리 하나로 검색하면 충분할까? 사용자 표현 방식에 따라 결과가 달라진다.

```
쿼리: "RAG 시스템 비용 줄이는 법"

이 쿼리 하나로 찾기 어려운 관련 문서:
- "벡터 DB 저장 비용 최적화"
- "임베딩 API 호출 캐싱 전략"
- "청크 수 줄이기 vs 품질"
- "LLM 토큰 예산 관리"
```

**Multi-Query:** LLM으로 쿼리 변형 3-5개 생성 → 각각 검색 → 결과 합산

```python
from langchain.retrievers.multi_query import MultiQueryRetriever

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=llm
)
# LLM이 자동으로 쿼리 변형 생성:
# 1. "RAG 운영 비용 절감 방법"
# 2. "벡터 검색 비용 최적화 기법"
# 3. "LLM 파이프라인 토큰 비용 줄이기"
# → 3개 각각 검색 → 중복 제거 후 합산

docs = retriever.invoke("RAG 시스템 비용 줄이는 법")
```

**쿼리 생성 프롬프트 커스터마이징 가능:**
```python
from langchain.prompts import PromptTemplate

QUERY_PROMPT = PromptTemplate(
    input_variables=["question"],
    template="""다음 질문에 대해 다양한 관점의 검색 쿼리 3개를 생성하세요.
질문: {question}
쿼리 (줄바꿈으로 구분):"""
)
```

🧠 핵심 멘탈 모델: **사용자 표현 ≠ 문서 표현. LLM으로 쿼리 다양화 → 검색 recall 향상.**

### 💥 What Breaks Without It?

```python
# Single query RAG, 기술 문서 Q&A
query = "서버 메모리 부족할 때 해결법"
results = vectorstore.similarity_search(query, k=3)
# 관련 문서: "OOM Killer 동작 원리", "swap 공간 설정" → 찾음
# 못 찾은 문서: "JVM heap 튜닝", "컨테이너 메모리 리밋 조정"
# → 이 표현들은 "메모리 부족"과 의미는 같지만 코사인 유사도가 낮음
```

→ 답변이 절반짜리. 사용자는 JVM이나 컨테이너 관련 내용을 기대했지만 누락.

---

## context-budget — 컨텍스트 예산 (Context Window Budget)

### Why Story

LLM context window가 128K token이면 문서를 최대한 많이 넣을수록 좋을까? 아니다.

**Lost in the Middle 문제:** LLM은 컨텍스트 앞부분과 뒷부분엔 잘 집중하지만 **중간은 무시하는 경향** 이 있다 (Liu et al., 2023).

```
컨텍스트 구조:
[청크1][청크2][청크3]...[청크15][청크16]...[청크25]
   ↑ LLM 잘 봄                           ↑ LLM 잘 봄
                  ↑ 중간 청크들 = LLM이 무시
```

**비용 문제:**
```
top-3 검색: ~1,500 tokens = $0.003
top-10 검색: ~5,000 tokens = $0.010
top-20 검색: ~10,000 tokens = $0.020

top-3으로 충분한데 top-20 넣으면 → 비용 6배, 정확도 하락
```

**실전 전략:**
```python
# 1. k를 작게 유지 (top-3~5)
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# 2. 관련성 임계값 필터
retriever = vectorstore.as_retriever(
    search_type="similarity_score_threshold",
    search_kwargs={"score_threshold": 0.75, "k": 5}
)

# 3. 가장 관련 있는 청크를 앞뒤에 배치 (중간 피하기)
docs = retriever.invoke(query)
reordered = [docs[0], docs[2], docs[4], docs[3], docs[1]]  # 중간에 덜 중요한 것
```

🧠 핵심 멘탈 모델: **컨텍스트 많음 ≠ 답변 좋음. LLM은 중간 내용 무시. 정밀 검색이 더 중요.**

### 💥 What Breaks Without It?

```python
# 128K 모델이니까 전부 넣자
docs = vectorstore.similarity_search(query, k=50)
context = "\n\n".join([d.page_content for d in docs])
# → 50,000 tokens 컨텍스트
# → 핵심 답변이 중간 어딘가에 있음
# → LLM이 무시하고 앞쪽에 있는 덜 관련된 내용으로 답변
# → 비용 20배, 정확도 하락
```

→ "넣을수록 좋다"는 직관이 틀림. k=3이 k=50보다 더 정확한 경우가 빈번.

---

## evaluation-ragas — RAG 평가 (RAGAS Evaluation)

### Why Story

RAG 시스템 만들었다. 잘 동작하나? "눈으로 10개 샘플 봤는데 괜찮아 보임" → 이걸로 충분할까?

아니다. 미묘한 hallucination, context 무시, 관련 없는 검색은 눈으로 잡기 어렵다.

**RAGAS 4개 지표:**

```
1. Faithfulness (충실도)
   → LLM 답변이 retrieved context에 근거하는가?
   → 낮으면: LLM이 context 무시하고 파라미터 지식으로 답변 (= hallucination)

2. Answer Relevance (답변 관련성)
   → 답변이 질문에 관련 있는가?
   → 낮으면: 질문과 무관한 장황한 답변

3. Context Precision (컨텍스트 정밀도)
   → Retrieved context가 얼마나 관련 있는가?
   → 낮으면: 검색이 노이즈 많은 문서 가져옴

4. Context Recall (컨텍스트 재현율)
   → 답변에 필요한 정보가 context에 있었는가?
   → 낮으면: 검색 단계에서 필요 정보 누락
```

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

data = {
    "question": ["트랜잭션 격리 수준이란?"],
    "answer": [rag_answer],
    "contexts": [retrieved_docs],
    "ground_truth": ["ACID의 I. READ COMMITTED, REPEATABLE READ, SERIALIZABLE..."]
}

result = evaluate(
    Dataset.from_dict(data),
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall]
)
print(result)
# {'faithfulness': 0.92, 'answer_relevancy': 0.88, ...}
```

🧠 핵심 멘탈 모델: **Faithfulness = LLM 신뢰도. Context Recall = 검색 신뢰도. 둘 다 높아야 RAG 성능 좋음.**

### 💥 What Breaks Without It?

```python
# 평가 없이 배포한 의료 정보 RAG
answer = rag_chain.invoke("아스피린 과다복용 증상")
# → Faithfulness 0.3: LLM이 retrieved 문서 무시하고 학습 데이터로 답변
# → 문서엔 없는 증상을 "있다"고 답변 (hallucination)
# → 눈으로 볼 때는 그럴듯하게 보였음
```

→ 평가 없으면 hallucination 비율을 모른 채 배포. 법률/의료 도메인에서 심각한 문제.

---

## rag-vs-finetuning — RAG vs 파인튜닝

### Why Story

새로운 도메인 지식을 LLM에 넣고 싶다. RAG vs Fine-tuning, 어떤 걸 선택?

**RAG를 선택해야 할 때:**
- 최신 데이터가 필요 (오늘 업데이트된 문서도 검색 가능)
- 출처(source)를 보여줘야 함
- 데이터가 자주 바뀜
- 빠르게 적용해야 함 (파인튜닝 없이 바로)
- 지식 범위가 넓음

**Fine-tuning을 선택해야 할 때:**
- 특정 출력 형식/스타일 학습 (JSON 구조, 특정 말투)
- 도메인 언어 패턴 습득 (의학 용어, 법률 문체)
- 지식이 아닌 **행동** 변화가 필요
- Prompt로 안 되는 것을 교정

```
"GPT에 회사 내규 학습시키고 싶다"
→ RAG (내규는 바뀌고 출처 확인 필요)

"항상 JSON으로만 답변하게 만들고 싶다"
→ Fine-tuning (행동 변화)

"의학 논문 요약 봇"
→ RAG + Fine-tuning (검색은 RAG, 의학 문체는 FT)
```

⚠️ **Fine-tuning으로 최신 지식 주입은 위험:**
- Catastrophic forgetting: 새 데이터 학습 시 기존 지식 손상
- 학습 데이터 cutoff 이후 정보 반영 불가
- 지식 업데이트할 때마다 재학습 필요

🧠 핵심 멘탈 모델: **RAG = 지식 외부화. Fine-tuning = 행동 내면화. 지식 주입엔 RAG.**

### 💥 What Breaks Without It?

```python
# Fine-tuning으로 주간 업데이트 제품 카탈로그 학습
# 월요일: GPT-4o 가격 $5/MTok로 학습
# 화요일: OpenAI가 $2.50/MTok으로 가격 인하 발표
# → 재학습 없이는 틀린 가격 답변
# → 재학습 비용 수백만원 + 수일 소요
```

→ 빠르게 바뀌는 지식에 fine-tuning = 지속 불가능한 운영 비용.

---

## hallucination — 환각 감지 (Hallucination Detection)

### Why Story

LLM은 그럴듯한 거짓말을 자신 있게 말한다. RAG가 있어도 LLM이 retrieved context를 무시하고 학습 데이터로 답변할 수 있다.

**RAG에서 hallucination이 생기는 경우:**
1. Context가 질문에 답을 못 함 → LLM이 "창작"
2. Context가 길어서 LLM이 중간 부분 무시 → 다른 내용으로 답변
3. 모호한 질문 → LLM이 임의로 해석

**감지 방법:**

```python
# 1. Faithfulness score (RAGAS)
from ragas.metrics import faithfulness
score = evaluate(data, metrics=[faithfulness])
# < 0.7이면 경고

# 2. NLI (Natural Language Inference) 기반
# 답변의 각 문장이 context에서 entailed(함의)되는지 확인
from transformers import pipeline
nli = pipeline("text-classification", model="cross-encoder/nli-deberta-v3-small")

for sentence in split_sentences(answer):
    result = nli({"text": context, "text_pair": sentence})
    if result["label"] == "CONTRADICTION":
        flag_hallucination(sentence)

# 3. Self-consistency
answers = [rag_chain.invoke(query) for _ in range(5)]
if low_consistency(answers):
    flag_uncertain()
```

**실전 가드레일:**
```python
# 답변 생성 후 검증 단계 추가
system_prompt = """
답변은 반드시 제공된 컨텍스트에만 근거하세요.
컨텍스트에 없는 내용은 "제공된 문서에서 찾을 수 없습니다"라고 답하세요.
"""
```

🧠 핵심 멘탈 모델: **RAG = hallucination 줄이는 것, 없애는 게 아님. 평가 + 가드레일 필수.**

### 💥 What Breaks Without It?

```python
# 법률 RAG, 판례 검색
query = "2023년 개인정보보호법 과징금 기준"
# Retrieved context: 2022년 법 내용 (2023년 개정 전)
# → LLM이 context 부족 감지 못하고 학습 데이터의 2023년 정보로 답변
# → 실제론 없는 조항을 "제OO조에 따르면..."으로 인용
# → 사용자는 출처 문서 번호까지 있으니 신뢰
```

→ hallucination 감지 없으면 자신감 있는 오답이 그대로 사용자에게 전달됨.

---

## metadata-filtering — 메타데이터 필터링 (Metadata Filtering)

### Why Story

사용자 A와 사용자 B가 같은 RAG 시스템을 쓴다. 사용자 A의 쿼리가 사용자 B의 문서를 가져오면?

메타데이터 = 각 청크에 붙이는 구조화된 태그. 검색 전 후보 집합을 좁힌다.

```python
# 문서 저장 시 메타데이터 추가
from langchain_core.documents import Document

docs = [
    Document(
        page_content="분기 매출 보고서...",
        metadata={
            "company_id": "company_A",
            "department": "finance",
            "date": "2024-01",
            "access_level": "confidential"
        }
    )
]

vectorstore = Chroma.from_documents(docs, embedding)

# 검색 시 필터 적용 (벡터 검색 전 후보 집합 제한)
results = vectorstore.similarity_search(
    query="매출 현황",
    k=3,
    filter={"company_id": "company_A", "access_level": "confidential"}
)
```

**Pre-filtering vs Post-filtering:**
```
Pre-filtering:  필터 조건 만족 벡터만 ANN 검색 → 빠름, recall 낮을 수 있음
Post-filtering: ANN top-k 검색 후 필터 적용  → 정확, k 크게 설정 필요
```

**활용 사례:**
- 멀티테넌시: `user_id`, `org_id`로 데이터 격리
- 시간 필터: `date > "2024-01"` 최신 문서만
- 언어 필터: `language = "ko"` 한국어 문서만
- 문서 타입: `doc_type = "manual"` 매뉴얼만 검색

🧠 핵심 멘탈 모델: **메타데이터 필터 = 벡터 검색 전 WHERE 절. 데이터 격리 + 검색 속도 향상.**

### 💥 What Breaks Without It?

```python
# B2B SaaS RAG, 메타데이터 필터 없음
# 회사 A: 비밀 계약서 업로드
# 회사 B: "계약 조건 관련 문서 찾아줘" 검색
results = vectorstore.similarity_search("계약 조건", k=3)
# → 회사 A의 비밀 계약서 청크가 top-1으로 반환
# → 데이터 격리 완전 실패
```

→ 멀티테넌트 시스템에서 메타데이터 필터 없는 RAG = 데이터 유출 사고.

---

## index-internals — ANN 인덱스 내부 (HNSW / IVF / PQ)

### Why Story

"벡터 DB 쓰면 빠르다"는 알겠는데, **왜** 빠른지 모르면 튜닝을 못 한다. recall이 떨어질 때 어느 노브를 돌릴지 모른다.

**HNSW (그래프 기반):** 계층 그래프를 타고 내려가며 근처 이웃 탐색.
```python
# 핵심 노브
# M         : 노드당 연결 수 (↑ recall↑, 메모리↑, build 느림)
# ef_construction : build 시 탐색 폭
# ef_search : query 시 탐색 폭 (↑ recall↑, latency↑)
index = faiss.IndexHNSWFlat(1536, 32)   # M=32
index.hnsw.efSearch = 64
```

**IVF (클러스터 기반):** 벡터를 `nlist`개 셀로 군집화, query 시 `nprobe`개 셀만 탐색.
```python
# nlist  : 클러스터 수
# nprobe : 검색할 클러스터 수 (↑ recall↑, latency↑)
quantizer = faiss.IndexFlatL2(1536)
index = faiss.IndexIVFFlat(quantizer, 1536, 100)  # nlist=100
index.nprobe = 8
```

**PQ (Product Quantization):** 벡터를 압축해 메모리 절감. recall 약간 희생.
```
Flat   : 100만 × 1536 × 4B = 6GB   (정확, 메모리 큼)
IVFPQ  : 같은 데이터 ~200MB         (메모리↓, recall 약간↓)
```

🧠 핵심 멘탈 모델: **ANN = recall ↔ latency ↔ memory 3축 곡선. 노브 하나 돌리면 나머지가 움직인다.**

### 💥 What Breaks Without It?

```python
# ef_search 기본값(16)으로 둔 채 "recall이 낮아요" 호소
# → 답은 ef_search를 64로 올리는 것인데, 내부를 모르면
#   엉뚱하게 embedding 모델부터 바꾸며 시간 낭비
```

→ 인덱스 내부를 모르면 recall 문제를 embedding/chunking 탓으로 오진. 정작 `nprobe`/`ef_search` 한 줄이면 해결될 일.

---

## schema-design — 벡터 스키마 설계 (Schema & Payload Index)

### Why Story

벡터 record에 어떤 필드를 넣고, 그중 무엇을 **filterable index**로 둘지가 retrieval 속도와 비용을 좌우한다.

```python
# Qdrant 예시 — payload index를 명시적으로 건다
client.create_payload_index(
    collection_name="docs",
    field_name="tenant_id",      # 자주 필터링 → 인덱스 필수
    field_schema="keyword",
)
# date, source, version 등도 필터 쓰면 인덱스 대상
```

**설계 결정 축:**
```
어떤 metadata를 저장할까        → 검색/격리/citation에 필요한 것만
무엇을 filterable index로 둘까  → 자주 WHERE 거는 필드만 (인덱스도 비용)
필드 추가 시 재인덱싱 전략      → schema versioning
```

🧠 핵심 멘탈 모델: **벡터 스키마 = RDB 테이블 설계 + 인덱스 설계. payload index 없는 필터는 full scan.**

### 💥 What Breaks Without It?

```python
# tenant_id에 payload index 없이 100만 벡터에 필터 검색
results = client.search(query_vector=qv,
    query_filter=Filter(must=[FieldCondition(key="tenant_id", match="A")]))
# → 필터가 매 query마다 full scan. p95 latency 폭발
```

→ 인덱스 없는 metadata filter는 격리는 되지만 느리다. 스키마를 나중에 바꾸면 전체 재인덱싱 비용 발생.

---

## cost-latency-eval — 비용/지연 평가 (Cost & Latency Eval)

### Why Story

정확도만 보면 함정에 빠진다. rerank + multi-query + top-k=50으로 faithfulness는 올랐는데, query당 비용 5배 latency 3배면 운영 불가.

```python
# quality만 보던 eval에 cost/latency 컬럼 추가
row = {
    "query_id": qid,
    "faithfulness": 0.91,
    "p95_latency_ms": 1840,
    "tokens_embed": 320,
    "tokens_llm": 2100,
    "cost_usd": 0.0043,
    "failure": None,   # timeout / empty / refusal / wrong
}
```

**측정 3축:** quality / cost / latency 를 **한 테이블**에서 비교해야 tradeoff가 보인다.

```
변경              faithfulness  p95(ms)  $/query
baseline          0.78          420      0.0011
+ rerank          0.86          910      0.0019
+ multi-query     0.91          1840     0.0043   ← 품질 +0.05에 비용 2배
```

🧠 핵심 멘탈 모델: **품질 개선은 거의 항상 cost/latency를 먹는다. 측정 없으면 "좋아졌다"는 착각.**

### 💥 What Breaks Without It?

```python
# offline에서 faithfulness만 보고 multi-query + rerank 배포
# → 프로덕션 p95 2초 초과, LLM 비용 월 예산 초과
# → 롤백. "왜 미리 몰랐지?" = cost/latency를 안 쟀기 때문
```

→ failure mode(timeout/empty/refusal) 분류도 없으면 "정확도 90%"가 실제로는 10% timeout을 숨기고 있을 수 있다.

---

## online-offline-eval — 오프라인/온라인 평가 (Offline vs Online Eval)

### Why Story

gold set으로 도는 offline eval은 **회귀 방지**용. 하지만 실제 사용자 분포·만족도는 못 잡는다. 그건 online feedback이 잡는다.

```
Offline (gold set)        Online (real traffic)
─────────────────         ─────────────────────
회귀 방지, 빠름            실제 분포/만족도
변경 전후 비교 가능        👍/👎, 클릭, 정정 신호
분포가 고정 → 과적합 위험  느림, 노이즈, 측정 어려움
```

**핵심 루프 — feedback 환류:**
```python
# online 👎 신호를 모아 다음 gold set으로 승격
for fb in load("data/feedback.jsonl"):
    if fb["rating"] == "down":
        append_gold("data/gold.jsonl", fb["query"], fb["expected"])
# → offline gold set이 실제 실패 케이스로 점점 두꺼워짐
```

🧠 핵심 멘탈 모델: **offline = 회귀 게이트, online = 진실의 원천. feedback → gold 환류로 둘을 잇는다.**

### 💥 What Breaks Without It?

```python
# offline gold set에서 faithfulness +0.04 → 배포
# 실제 사용자 👎 비율은 오히려 증가
# → gold set 분포가 실제 쿼리와 달랐음 (offline 과적합)
```

→ offline만 믿으면 gold set에 과적합. online만 믿으면 회귀를 배포 후에야 발견. 둘 다 있어야 안전한 배포 루프.

---

## citation-grounding — 출처 근거화 (Citation & Grounding)

### Why Story

"그럴듯한 답"과 "근거를 추적할 수 있는 답"은 다르다. 답변 각 주장이 실제 chunk에 근거하는지 검증해야 신뢰할 수 있다.

```python
# 답변에 인라인 citation 강제
SYSTEM = """답변 각 문장 끝에 근거 chunk id를 [c3] 형태로 붙여라.
근거가 없으면 '모르겠습니다'라고 답하라."""

answer = "위약금 조항은 없습니다 [c2]. 단, 해지 통보는 30일 전 [c5]."
```

**근거 검증 (claim ↔ source span):**
```python
def check_grounding(answer, retrieved_chunks):
    for sentence, cite_id in parse_citations(answer):
        chunk = retrieved_chunks[cite_id]
        # 문장 주장이 chunk span에 실제로 있는가 (NLI/substring/LLM judge)
        if not supported(sentence, chunk):
            yield ("unsupported", sentence)
```

**eval metric:** citation coverage(인용 붙은 문장 비율), unsupported claim rate.

🧠 핵심 멘탈 모델: **grounding = 답변 → source span 역추적 가능성. citation은 hallucination을 측정 가능하게 만든다.**

### 💥 What Breaks Without It?

```python
# citation 없는 RAG 답변
"이 약관에 따르면 환불은 14일 이내 가능합니다."
# → 어느 문서 어느 조항인지 추적 불가
# → 실제론 retrieval에 없던 내용을 LLM이 지어냄 (hallucination)
# → 법무/의료 도메인에선 치명적
```

→ citation 없으면 hallucination을 사후 검증할 방법이 없다. 사용자도 답을 신뢰할 근거가 없다.
