# Spring Data Pipeline — Learning Curriculum

## Prerequisites Map

```
spring-di (from spring-guide)
    │
    ▼
batch-basics ──→ batch-config ──→ batch-scheduling
                      │
                      ▼
                 batch-error (retry/skip/restart)

kafka-basics ──→ kafka-producer ──→ kafka-consumer ──→ kafka-error
                                         │
                                         ▼
                                   kafka-consumer-group
```

## Topics

### Spring Batch (Week 1)

| ID | Topic | Prerequisites | Django Mapping |
|----|-------|--------------|----------------|
| 01 | batch-basics | spring-di | 없음 (management command는 재시작/청킹 없음) |
| 02 | batch-config | batch-basics | 없음 |
| 03 | batch-scheduling | batch-config | Celery beat |
| 04 | batch-error | batch-config | Celery retry |

### Apache Kafka + Spring Kafka (Week 2)

| ID | Topic | Prerequisites | Django Mapping |
|----|-------|--------------|----------------|
| 05 | kafka-basics | 없음 | 없음 (Django는 Kafka 네이티브 아님) |
| 06 | kafka-producer | kafka-basics | Celery task 발행 (느슨한 유사) |
| 07 | kafka-consumer | kafka-basics | Celery worker |
| 08 | kafka-consumer-group | kafka-consumer | 없음 |
| 09 | kafka-error | kafka-consumer | Celery retry + DLQ |

## Topic Detail

### batch-basics
**핵심 개념:** Job → Step → Chunk(Reader/Processor/Writer) 계층 구조
**Django 비교:** Django management command는 단순 스크립트. Spring Batch는 체크포인트, 재시작, 청킹, 멱등성 보장.
**주요 어노테이션:** `@EnableBatchProcessing`, `@Bean Job`, `@Bean Step`
**핵심 질문:** "배치 Job이 중간에 실패하면 처음부터 다시 실행해야 하는가?"

### batch-config
**핵심 개념:** JobBuilder, StepBuilder, chunk size, DataSource 설정
**주요 어노테이션:** `@Configuration`, `JobRepository`, `PlatformTransactionManager`
**Gotcha:** chunk size = 한 트랜잭션 단위. 너무 크면 메모리 문제, 너무 작으면 DB 부하.
**실습:** ItemReader(DB) → ItemProcessor(변환) → ItemWriter(파일) 파이프라인 구현

### batch-scheduling
**핵심 개념:** `@Scheduled` + JobLauncher로 주기적 실행. Quartz 통합.
**Django 비교:** Celery beat는 태스크 큐 기반. Spring Scheduled는 JVM 내부 스레드.
**Gotcha:** 클러스터 환경에서 중복 실행 방지 → ShedLock 또는 Quartz 필요

### batch-error
**핵심 개념:** skip (특정 예외 건너뜀), retry (재시도), restart (중단점 재개)
**주요 API:** `.faultTolerant().skip(Exception.class).skipLimit(10)`
**핵심 질문:** "1만 건 중 5건 오류 시 전체 롤백 vs 5건만 skip?"

### kafka-basics
**핵심 개념:** Broker, Topic, Partition, Consumer Group, Offset
**Django 비교:** Django에는 없음. Kafka는 영속적 메시지 로그. RabbitMQ는 소비 후 삭제.
**핵심 트레이드오프:** Partition 수 = 최대 동시 컨슈머 수. 나중에 늘리면 순서 보장 깨짐.
**면접 질문:** "Kafka와 RabbitMQ 차이는?"

### kafka-producer
**핵심 개념:** KafkaTemplate, ProducerRecord, 직렬화(Serializer)
**주요 어노테이션:** `@Bean KafkaTemplate`, `ProducerFactory`
**Gotcha:** acks=all + retries 설정 안 하면 메시지 유실 가능
**실습:** 이벤트 발행 서비스 구현 (예: 매치 생성 시 Kafka 토픽 발행)

### kafka-consumer
**핵심 개념:** `@KafkaListener`, ConsumerRecord, 오프셋 커밋
**주요 어노테이션:** `@KafkaListener(topics="...", groupId="...")`
**Gotcha:** 오프셋 자동커밋(auto-commit) vs 수동커밋. 자동커밋이면 처리 실패해도 오프셋 전진.
**실습:** 이벤트 수신 → DB 저장 컨슈머 구현

### kafka-consumer-group
**핵심 개념:** 같은 groupId = 파티션 분배. 다른 groupId = 독립 소비.
**핵심 질문:** "같은 이벤트를 두 팀이 각자 처리하려면?" → 서로 다른 groupId
**면접 질문:** "Consumer group rebalancing이란?"

### kafka-error
**핵심 개념:** retry 설정, Dead Letter Topic (DLT), `@RetryableTopic`
**주요 API:** `@RetryableTopic(attempts="3", backoff=@Backoff(delay=1000))`
**Gotcha:** DLT 모니터링 안 하면 실패 메시지 영구 소실
**실습:** 처리 실패 시 DLT로 라우팅하는 컨슈머 구현

## Session Structure

Each topic session follows:

1. **Django 비교** — "Django에서는 X, Spring에서는 Y (또는 없음)" 브릿지 설명
2. **핵심 개념** — 동작원리, 트레이드오프, 언제 쓰는지
3. **코드 실습** — 사용자가 직접 작성 (context7로 최신 docs 참조)
4. **퀴즈** — 3-5개 확인 문제
5. **실전 과제** — 포트폴리오/RAG 프로젝트에 적용

## Stack (use context7 for latest)

- Spring Boot 3.x + Java 21
- Spring Batch 5.x
- Spring Kafka 3.x
- Apache Kafka 3.x
- Gradle (Kotlin DSL)

## Target JDs

- 우아한형제들 Data Service AI (R2506002)
- Kakao 데이터 엔지니어링
- Line 백엔드 → 데이터 파이프라인
- 배달의민족 플랫폼팀
