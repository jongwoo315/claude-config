# Spring Data Pipeline Why Cards

## Topics

| ID | Topic | 핵심 질문 |
|----|-------|----------|
| batch-chunk | Batch 청킹 | 왜 1백만 건을 한 번에 읽으면 안 되나? |
| batch-restart | Batch 재시작 | 왜 실패 시 처음부터 재실행 안 해도 되나? |
| batch-skip | Batch Skip | 왜 5건 오류 때 전체 롤백 안 하나? |
| kafka-vs-queue | Kafka vs Queue | 왜 RabbitMQ 대신 Kafka인가? |
| consumer-group | Consumer Group | 왜 파티션 수 = 최대 컨슈머 수인가? |
| offset-commit | Offset 커밋 | 왜 자동 커밋이 위험한가? |
| kafka-dlq | Dead Letter Queue | 왜 실패 메시지를 그냥 버리면 안 되나? |

---

## batch-chunk — Batch 청킹 (Chunk-Oriented Processing)

### Why Story
Django management command로 100만 건 데이터 마이그레이션 한다면?

```python
# Django — 순진한 방법
def handle(self, *args, **options):
    rows = list(OldTable.objects.all())  # 100만 건 전부 메모리에 로드
    for row in rows:
        NewTable.objects.create(...)
```

100만 건 = 수 GB 메모리 → OOM(OutOfMemory) 크래시.

Spring Batch는 **Chunk 단위**로 읽고 처리하고 쓴다.

```
읽기(1000건) → 처리(1000건) → 쓰기(1000건) → 커밋
읽기(1000건) → 처리(1000건) → 쓰기(1000건) → 커밋
...반복...
```

```java
@Bean
public Step migrationStep() {
    return stepBuilderFactory.get("migrationStep")
        .<OldRow, NewRow>chunk(1000)   // 1000건씩
        .reader(dbReader())
        .processor(transformer())
        .writer(dbWriter())
        .build();
}
```

메모리는 항상 chunk size(1000건) 분량만 사용. 100만 건이든 10억 건이든 동일.

🐍 Django로 치면: `queryset.iterator()` + `bulk_create(batch_size=1000)` 패턴. 근데 Batch처럼 자동 체크포인트는 없음.

🧠 핵심 멘탈 모델: **"청킹 = 스트리밍"** — 전체 로드 대신 조금씩 처리. 메모리는 O(chunk_size), 처리량은 O(N).

### 💥 What Breaks Without It?
```java
@Bean
public ItemReader<OldRow> reader() {
    return new ListItemReader<>(jdbcTemplate.query(
        "SELECT * FROM old_table",  // 전체 쿼리 → List로 반환
        rowMapper
    ));
}
```
→ 100만 건 전부 `List<OldRow>`에 담김. 힙 메모리 초과 → `OutOfMemoryError`. 서버 다운.

---

## batch-restart — Batch 재시작 (Job Restartability)

### Why Story
Django management command로 100만 건 배치 돌리다 50만 건째에 네트워크 에러 발생.

```python
# Django — 재시작하면?
python manage.py migrate_data
# 처음부터 다시 시작. 50만 건 중복 처리 가능.
```

Spring Batch는 **JobRepository**에 실행 상태를 DB에 저장한다.

```
실행 1: 1~50만건 처리 → 실패 → DB에 "50만건 완료" 기록
실행 2: 재실행 → 50만1건부터 시작
```

```java
// 자동 처리됨 — JobRepository가 마지막 성공 지점 기억
jobLauncher.run(migrationJob, new JobParameters());
```

실패해도 처음부터 재실행 불필요. 중단점에서 재개.

🐍 Django로 치면: 없음. 직접 `last_processed_id` 컬럼 만들어 추적해야 함.

🧠 핵심 멘탈 모델: **"배치 = 체크포인트 게임"** — Spring Batch가 세이브 포인트 자동 관리. 죽어도 거기서 부활.

### 💥 What Breaks Without It?
매일 밤 10시 정산 배치, 100만 건 처리 중 새벽 2시에 DB 커넥션 타임아웃. 재실행하면?

→ 처음부터 다시 실행 → 앞 부분 중복 정산 → 이미 정산된 건 또 정산됨 → 금액 오류 → 새벽 긴급 롤백.

Spring Batch: 재실행 → 실패 지점부터 재개 → 중복 없음.

---

## batch-skip — Batch Skip (Fault Tolerance)

### Why Story
100만 건 중 5건이 형식 오류 데이터. 이 5건 때문에 전체 배치가 실패해야 하나?

```java
// Skip 없음 — 1건 오류 시 전체 실패
@Bean
public Step step() {
    return stepBuilderFactory.get("step")
        .<Row, Row>chunk(1000)
        .reader(reader())
        .writer(writer())
        .build();
}
```

Spring Batch `.faultTolerant()` 사용:

```java
@Bean
public Step step() {
    return stepBuilderFactory.get("step")
        .<Row, Row>chunk(1000)
        .reader(reader())
        .writer(writer())
        .faultTolerant()
        .skip(DataFormatException.class)  // 이 예외는 건너뜀
        .skipLimit(10)                     // 최대 10건까지만 허용
        .build();
}
```

5건 오류 → skip 처리 → 나머지 999,995건 정상 완료.

🐍 Django로 치면: try/except 직접 감싸고 로그 남기는 수동 패턴.

🧠 핵심 멘탈 모델: **"skipLimit = 허용 불량률"** — 불량 5건 허용하면 나머지는 살린다. 단 10건 초과 시 전체 실패로 전환(이상 데이터 의심).

### 💥 What Breaks Without It?
100만 건 정산 배치. 고객 1명 데이터 형식 오류. skip 설정 없으면?

→ 오류 1건에 배치 전체 중단 → 999,999명 정산 안 됨 → 수동 재처리 → 야근.

---

## kafka-vs-queue — Kafka vs 메시지 큐 (Log vs Queue)

### Why Story
Django + Celery(Redis broker)로 주문 이벤트 처리한다고 하자.

```python
# Celery + Redis
order_created.delay(order_id=123)
# Redis: 메시지 저장 → Worker가 소비 → 메시지 삭제
```

문제: 주문팀(정산), 배송팀(배송), 마케팅팀(쿠폰발급) 모두 같은 이벤트 필요.

```
Redis → Worker A (정산) → 메시지 삭제
→ Worker B (배송) → 이미 없음 ❌
```

Kafka는 **로그(Log)** 구조. 메시지를 소비해도 삭제 안 함.

```
Kafka Topic: [주문이벤트 로그]
  ← 정산팀 Consumer Group이 읽음 (오프셋 5)
  ← 배송팀 Consumer Group이 읽음 (오프셋 5)
  ← 마케팅팀 Consumer Group이 읽음 (오프셋 5)
```

각 팀이 독립적으로 자기 속도로 읽음. 메시지는 보존 기간(7일 등)까지 유지.

🐍 Django로 치면: Celery는 RabbitMQ/Redis 기반 큐 → 소비 후 삭제. Kafka는 개념 자체가 다름.

🧠 핵심 멘탈 모델: **"큐 = 편지, Kafka = 신문"** — 편지는 한 명만 읽고 버림. 신문은 여러 명이 각자 읽음.

### 💥 What Breaks Without It?
Redis 큐로 주문 이벤트 발행. 정산팀이 먼저 소비. 배송팀이 이벤트 받아야 하는데?

→ 메시지 이미 소비됨 → 배송팀은 별도 큐 필요 → 발행자가 여러 큐에 따로 발행 → 서비스 간 결합 증가 → 유지보수 지옥.

---

## consumer-group — Consumer Group (파티션 분배)

### Why Story
Kafka Topic에 파티션이 3개. Consumer를 5개 띄우면 처리량이 5배가 될까?

```
Topic Partitions: [P0] [P1] [P2]

Consumer Group A:
  Consumer 1 → P0
  Consumer 2 → P1
  Consumer 3 → P2
  Consumer 4 → 놀고 있음 (idle) ❌
  Consumer 5 → 놀고 있음 (idle) ❌
```

**파티션 = 병렬성의 단위.** 파티션 1개는 한 Consumer Group 내에서 반드시 1개의 컨슈머만 담당.

파티션 3개 → 최대 동시 처리 컨슈머 3개. 나머지는 standby.

```java
@KafkaListener(topics = "orders", groupId = "settlement-group")
public void consume(OrderEvent event) {
    // 이 메서드가 최대 3개 스레드에서 동시 실행 (파티션 3개 기준)
}
```

🐍 Django로 치면: Celery worker 수 = 동시 처리량. 근데 Kafka는 파티션이 병목.

🧠 핵심 멘탈 모델: **"파티션이 레인, 컨슈머가 수영선수"** — 레인(파티션)보다 선수(컨슈머) 많아도 레인 수 이상 동시 수영 불가.

### 💥 What Breaks Without It?
처리량 높이려고 Consumer 10개 띄움. 파티션은 3개. 결과?

→ 7개 컨슈머 항상 idle → 인프라 낭비 → 처리량은 파티션 3개 수준 그대로 → 파티션 수 늘려야 해결.

---

## offset-commit — Offset 커밋 (At-Least-Once vs Exactly-Once)

### Why Story
Kafka 컨슈머가 메시지를 읽었다. 언제 "읽었다"고 표시해야 할까?

**자동 커밋 (Auto Commit):**
```
메시지 읽기 → [5초 후 자동으로 오프셋 커밋] → DB 저장 처리
```

순서 문제: 오프셋 커밋 후 → DB 저장 전에 컨슈머 크래시 → 재시작 시 이미 커밋됨 → 해당 메시지 재처리 안 됨 → **데이터 유실**.

**수동 커밋 (Manual Commit):**
```java
@KafkaListener(topics = "orders")
public void consume(ConsumerRecord<String, OrderEvent> record,
                    Acknowledgment ack) {
    orderService.save(record.value());  // DB 저장 먼저
    ack.acknowledge();                   // 성공 후 커밋
}
```

DB 저장 성공 후 커밋 → 크래시 시 재처리됨 → **At-Least-Once** 보장.

🐍 Django로 치면: Celery `acks_late=True` 설정과 유사. 처리 완료 후 ACK.

🧠 핵심 멘탈 모델: **"커밋 = 영수증"** — 영수증을 처리 전에 발행하면 환불(재처리) 못 받음.

### 💥 What Breaks Without It?
`enable.auto.commit=true` (기본값). 주문 이벤트 소비 중 메시지 10개 읽음 → 5초 후 자동 커밋 → 커밋 직후 서버 재시작 → 10개 중 6~10번 메시지 DB 저장 안 됨 → 재시작 후 11번부터 읽음 → 6~10번 주문 유실.

---

## kafka-dlq — Dead Letter Queue (실패 메시지 처리)

### Why Story
컨슈머가 메시지 처리 중 예외 발생. retry 3번 해도 실패. 그 다음은?

**DLQ 없을 때:**
```
메시지 처리 실패 → 재시도 무한 반복
→ 해당 파티션 블록 → 다음 메시지 처리 안 됨 → 전체 정체
```

하나의 **독성 메시지(Poison Pill)**가 파티션 전체를 멈춤.

**DLQ(Dead Letter Topic) 사용:**
```java
@RetryableTopic(
    attempts = "3",
    backoff = @Backoff(delay = 1000),
    dltTopicSuffix = "-dlt"
)
@KafkaListener(topics = "orders")
public void consume(OrderEvent event) {
    orderService.process(event);
}
// 3회 실패 시 → orders-dlt 토픽으로 자동 이동
```

실패 메시지 → DLT 토픽 격리 → 나머지 정상 메시지 계속 처리 → 나중에 DLT 조사.

🐍 Django로 치면: Celery `CELERY_TASK_REJECT_ON_WORKER_LOST` + `task_acks_late` + 별도 dead_letter 큐 수동 구성.

🧠 핵심 멘탈 모델: **"DLQ = 격리 병실"** — 독성 환자(실패 메시지)를 일반 병동(메인 토픽)에서 격리. 다른 환자 치료 계속.

### 💥 What Breaks Without It?
DLQ 없이 retry만 설정. JSON 파싱 불가능한 메시지(잘못된 형식) 들어옴. 결과?

→ 파싱 예외 → 3회 재시도 → 계속 실패 → retry 무한 루프 → 해당 파티션 메시지 처리 0 → 주문 이벤트 전체 밀림 → 장애.
