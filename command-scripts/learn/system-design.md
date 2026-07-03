# System Design Problems

## Problem Set

### Tier 1: 기본 (Month 4)

| Problem | Domain | Key Topics | Target Company |
|---------|--------|-----------|----------------|
| url-shortener | General | 해싱, DB 설계, 캐싱, 스케일링 | All |
| rate-limiter | General | Token bucket, sliding window, Redis | All |
| chat-system | Social | WebSocket, 메시지 큐, 파티셔닝 | All |
| notification | General | 푸시, 이메일, SMS 통합, 재시도 | All |

### Tier 2: 도메인 특화 (Month 5)

| Problem | Domain | Key Topics | Target Company |
|---------|--------|-----------|----------------|
| payment-system | Fintech | 트랜잭션, 멱등성, 정산, 동시성 | Toss, KakaoBank |
| transfer-system | Fintech | 이중 기장, 잔액 정합성, 분산 락 | Toss, KakaoBank |
| product-search | E-commerce | Elasticsearch, 필터링, 랭킹 | Musinsa |
| order-inventory | E-commerce | 재고 관리, 동시성, 이벤트 소싱 | Musinsa |
| music-streaming | Media | CDN, 추천, 재생 큐, 오프라인 | YouTube Music |
| video-processing | Media | 인코딩 파이프라인, 스토리지, CDN | YouTube Music |

### Tier 3: 고급 (Month 5-6)

| Problem | Domain | Key Topics | Target Company |
|---------|--------|-----------|----------------|
| distributed-cache | Infra | 일관성, 파티셔닝, 복제 | Google |
| search-engine | Infra | 인덱싱, 크롤링, 랭킹 | Google |
| feed-system | Social | Fan-out, 타임라인, 캐싱 전략 | All |

## Session Structure

### Phase 1: 요구사항 정리 (5분)
- Functional requirements
- Non-functional requirements (QPS, latency, availability)
- 규모 추정 (back-of-envelope calculation)

### Phase 2: High-Level Design (15분)
- 핵심 컴포넌트 식별
- API 설계
- 데이터 모델

### Phase 3: Deep Dive (20분)
- 핵심 컴포넌트 상세 설계
- 트레이드오프 논의
- 병목 지점 식별 + 해결

### Phase 4: 피드백 (10분)
- 놓친 포인트
- 면접관 관점 추가 질문
- 점수 (S/A/B/C) + 개선점

## Evaluation Rubric

| Category | Weight | S | C |
|----------|--------|---|---|
| Requirements | 15% | 명확한 범위 설정 | 모호하게 시작 |
| High-Level | 25% | 핵심 컴포넌트 정확 | 중요 컴포넌트 누락 |
| Deep Dive | 30% | 트레이드오프 논의 | 단일 해법만 제시 |
| Scalability | 20% | 병목 식별+해결 | 스케일링 미고려 |
| Communication | 10% | 구조적 설명 | 두서없는 설명 |

## Related dev-concept References

| Problem | Relevant Concepts |
|---------|-------------------|
| payment/transfer | saga-pattern, event-driven, queue-patterns |
| product-search | caching-strategies, db-optimization |
| chat-system | websocket, event-driven |
| order-inventory | event-sourcing, cqrs, ddd-architecture |
| distributed-cache | caching-strategies |
