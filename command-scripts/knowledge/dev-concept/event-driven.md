# Event-Driven Architecture — Quick Reference

## Key Principles
- **Events are facts, not commands** — `MatchCancelled` (past tense), not `CancelMatch` (imperative)
- **Producers don't know consumers** — match service emits event; refund/notification/slot subscribe independently
- **Idempotent handlers** — every handler must tolerate the same event twice
- **Eventual consistency is the default** — read models may lag; design UIs accordingly
- **Events carry identity, not full state** — include IDs + changed fields, fetch rest if needed

## When to Use
- One action triggers multiple independent side effects (cancellation -> refund + notification + slot release)
- Services must stay decoupled (match service should not import refund logic)
- Workload is spiky and consumers should process at their own pace

## Decision Guide
| Question | Yes | No |
|----------|-----|-----|
| Consumers need result synchronously? | Direct call | Event |
| 2+ independent reactions? | Event | Direct call may suffice |
| Reactions must succeed atomically? | Saga, not events | Events are fine |
| Ordering between events critical? | Single queue + sequence nums | Fan out freely |

## Code Smells
```python
# SMELL: handler assumes exactly-once delivery
@app.task
def handle_match_cancelled(event):
    Refund.objects.create(match_id=event["match_id"], amount=calc())  # duplicate on retry
# FIX: get_or_create or idempotency key

# SMELL: fat event payload — couples producer schema to all consumers
event = {"match": MatchSerializer(match).data}  # 2KB, breaks when serializer changes
# FIX: {"event_id": "evt_x", "match_id": 42, "reason": "insufficient_players"}

# SMELL: ordering dependency between "independent" handlers
# "notification must happen after refund" — that's a saga, not independent events
```

## Common Mistakes
- **No dead letter handling** — failed events vanish silently
- **Missing event_id** — no way to deduplicate on consumer side
- **Fat events** — large payloads couple producer to all consumers
- **Treating eventual consistency as a bug** — design for it, don't fight it

## Stack Hints (Django / Celery / Redis)
```python
# Fan out via Celery group
def cancel_match(match_id, reason):
    match = Match.objects.select_for_update().get(id=match_id)
    match.status = "cancelled"
    match.save()
    event = {"event_id": uuid4().hex, "match_id": match_id, "reason": reason}
    group(process_refunds.s(event), release_slots.s(event),
          send_cancellation_notifications.s(event)).apply_async()

# Idempotent handler with Redis dedup
@app.task(bind=True, max_retries=3)
def process_refunds(self, event):
    if redis_client.sismember("processed_events", event["event_id"]):
        return
    do_refund(event["match_id"])
    redis_client.sadd("processed_events", event["event_id"])
```

## Stack Hints (Spring / Kotlin)
```kotlin
// Domain event as data class
data class MatchCancelled(val eventId: String = UUID.randomUUID().toString(),
                          val matchId: Long, val reason: String)

// Publisher: ApplicationEventPublisher
@Service
class MatchService(private val eventPublisher: ApplicationEventPublisher) {
    @Transactional
    fun cancelMatch(matchId: Long, reason: String) {
        val match = matchRepository.findByIdForUpdate(matchId)
        match.status = MatchStatus.CANCELLED
        matchRepository.save(match)
        eventPublisher.publishEvent(MatchCancelled(matchId = matchId, reason = reason))
    }
}

// Consumers: @TransactionalEventListener (after commit) + @Async for parallel
@Component
class RefundEventHandler(private val redisTemplate: StringRedisTemplate) {
    @Async
    @TransactionalEventListener
    fun handle(event: MatchCancelled) {
        if (redisTemplate.opsForSet().isMember("processed_events", event.eventId) == true) return
        refundService.process(event.matchId)
        redisTemplate.opsForSet().add("processed_events", event.eventId)
    }
}
// Note: @TransactionalEventListener fires after TX commit — safe from partial state
// For cross-service: Spring Cloud Stream or Kafka @KafkaListener
```
