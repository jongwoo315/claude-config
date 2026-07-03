# Event Sourcing

## Key Principles
- **Store facts, derive state**: Persist immutable events ("what happened"), compute current state from the event stream.
- **Events are the source of truth**: The `events` table is authoritative; any read model (projection) is disposable and rebuildable.
- **Append-only, never mutate**: Events are immutable. Corrections are new events (`PaymentRefunded`), not updates to `PaymentCompleted`.
- **Separate write model from read model**: Commands produce events (write side), projections consume events into query-optimized views (read side).

## When to Use
- **Audit-critical domains**: Payments, bookings, inventory — anywhere "what happened and when" is a business requirement.
- **Complex state transitions**: When an entity's lifecycle has many states and transitions that need to be traceable.
- **Temporal queries**: "What was the state at timestamp X?" or "How did we get to this state?"
- **NOT for**: Simple CRUD, settings pages, user profiles — event sourcing adds complexity without proportional value.

## Decision Guide
- Can you answer "why is this record in this state?" from your current schema? If no, consider event sourcing.
- Do you need to replay history or rebuild state? Event sourcing. Just need an audit log? Use a simpler audit trail table.
- Start with event sourcing on ONE bounded context (e.g., `payments`), not the entire system.
- If your domain experts think in terms of "things that happen" rather than "current state," event sourcing fits naturally.

## Code Smells

```python
# SMELL: mutable state with no history for critical flow
class Booking(models.Model):
    status = models.CharField(max_length=20)  # overwritten on each transition
    updated_at = models.DateTimeField(auto_now=True)
    # "Why was this cancelled?" — no one knows

# BETTER: event-sourced booking
class BookingEvent(models.Model):
    booking_id = models.UUIDField(db_index=True)
    event_type = models.CharField(max_length=50)  # "BookingCreated", "BookingCancelled"
    payload = models.JSONField()  # {"reason": "user_request", "refund_amount": 5000}
    occurred_at = models.DateTimeField(default=timezone.now)
    version = models.PositiveIntegerField()

    class Meta:
        unique_together = ("booking_id", "version")  # optimistic concurrency
```

```python
# SMELL: reconstructing state from scattered tables
status = booking.status
payments = Payment.objects.filter(booking=booking)
refunds = Refund.objects.filter(booking=booking)
cancellation = Cancellation.objects.filter(booking=booking).first()
# 4 tables to answer "what happened to this booking"

# BETTER: single event stream
events = BookingEvent.objects.filter(booking_id=bid).order_by("version")
state = BookingAggregate.rebuild_from(events)
```

```python
# Projection: build a read-optimized view from events
def project_booking_summary(booking_id):
    events = BookingEvent.objects.filter(booking_id=booking_id).order_by("version")
    summary = {}
    for event in events:
        if event.event_type == "BookingCreated":
            summary = {"status": "confirmed", **event.payload}
        elif event.event_type == "BookingCancelled":
            summary["status"] = "cancelled"
            summary["cancel_reason"] = event.payload.get("reason")
    BookingSummary.objects.update_or_create(booking_id=booking_id, defaults=summary)
```

## Common Mistakes
- **Event sourcing everything**: Use it only where audit/history/replay has clear business value.
- **Fat events**: Events should carry facts, not computed/derived data. Keep them lean.
- **No snapshotting**: Replaying 100k events per request is unsustainable. Snapshot aggregate state periodically.
- **Ignoring event versioning**: Events schemas evolve. Use `schema_version` and upcasters from the start.
- **Synchronous projections in the write path**: Project asynchronously (Celery) to keep writes fast.

## Stack Hints (Django / Celery / Redis)
- **Event store**: Django model with `(aggregate_id, version)` unique constraint for optimistic concurrency.
- **Projections**: Celery tasks triggered on event creation; rebuild projections into regular Django models for fast reads.
- **Snapshotting**: Store serialized aggregate state in Redis (or a DB table) every N events.
- **Concurrency**: Use `select_for_update()` or version checks to prevent conflicting concurrent appends.

## Stack Hints (Spring / Kotlin)
```kotlin
// Event as sealed interface + data classes
sealed interface BookingEvent {
    val bookingId: UUID
    val occurredAt: Instant
    val version: Int
}
data class BookingCreated(override val bookingId: UUID, val userId: Long, val matchId: Long,
    override val occurredAt: Instant = Instant.now(), override val version: Int = 1) : BookingEvent
data class BookingCancelled(override val bookingId: UUID, val reason: String,
    override val occurredAt: Instant = Instant.now(), override val version: Int) : BookingEvent

// Event store: JPA entity
@Entity @Table(uniqueConstraints = [UniqueConstraint(columnNames = ["aggregateId", "version"])])
class StoredEvent(
    @Id @GeneratedValue val id: Long = 0,
    val aggregateId: UUID, val eventType: String,
    @Column(columnDefinition = "JSON") val payload: String,
    val version: Int, val occurredAt: Instant
)

// Aggregate rebuild
class BookingAggregate {
    var status: BookingStatus = BookingStatus.PENDING; private set
    fun apply(events: List<BookingEvent>) = events.forEach { apply(it) }
    private fun apply(event: BookingEvent) = when (event) {
        is BookingCreated -> { status = BookingStatus.CONFIRMED }
        is BookingCancelled -> { status = BookingStatus.CANCELLED }
    }
}

// Projection: @TransactionalEventListener + @Async
// Snapshotting: Redis hash or separate table every N events
// Framework option: Axon Framework (full CQRS+ES with Spring Boot starter)
```
