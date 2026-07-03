# Saga Pattern — Quick Reference

## Key Principles
- **Irreversible steps execute last** — charge payment before sending email, not after
- **Timeout != failure** — always check actual status before compensating (payment gateway may have succeeded)
- **Notification steps go last** — they have no compensation and are side-effect-only
- **Idempotent compensation** — compensators must be safe to retry (use idempotency keys for refunds)
- **Each step is an independent transaction** — no shared DB transaction across services

## When to Use
- Multi-service operations that must either all complete or all roll back
- Any workflow mixing DB writes with external API calls (payment, SMS, email)
- Long-running processes where holding a DB transaction is not viable

## Decision Guide: Orchestration vs Choreography
| Factor | Orchestration (central coordinator) | Choreography (event chain) |
|--------|-------------------------------------|----------------------------|
| Steps | > 3 or complex ordering | 2-3 loosely coupled steps |
| Visibility | Need clear audit trail | Events are self-documenting |
| Coupling | Steps don't know each other | Each step knows next event |
| Failure | Central retry/compensation logic | Each service handles own failure |
**Default choice for Django/Celery: Orchestration** via a Celery chain/chord with explicit compensators.

## Code Smells

```python
# SMELL: transaction.atomic wrapping external API calls
with transaction.atomic():
    order.status = 'confirmed'
    order.save()
    payment_gateway.charge(order.total)  # if this times out, DB rolls back but charge may have succeeded
    send_confirmation_email(order)        # side effect inside transaction

# SMELL: sequential external calls without compensation
def process_order(order):
    charge_payment(order)    # succeeds
    reserve_inventory(order) # fails — payment is now orphaned
    notify_user(order)

# SMELL: bare except hiding saga failures
try:
    refund_payment(order)
except:  # swallows RefundAlreadyProcessed, NetworkError, InvalidAmount equally
    pass
```

## Common Mistakes
- **Compensating on timeout** — payment may have succeeded; query status first
- **Missing idempotency keys** — retried compensations create duplicate refunds
- **No saga state persistence** — server restart loses track of in-flight sagas
- **Synchronous orchestration** — blocking web request on multi-step saga instead of async

## Stack Hints (Django / Celery / Redis)
```python
# Orchestrator pattern with Celery chain + link_error
from celery import chain

saga = chain(
    charge_payment.s(order_id),
    reserve_inventory.s(order_id),
    send_confirmation.s(order_id),
)
saga.apply_async(link_error=compensate_order.s(order_id))

# Saga state in Redis for visibility
redis_client.hset(f"saga:{saga_id}", mapping={"step": "payment", "status": "pending"})
```

## Stack Hints (Spring / Kotlin)
```kotlin
// Orchestrator with explicit saga state
@Service
class OrderSagaOrchestrator(
    private val paymentService: PaymentService,
    private val inventoryService: InventoryService,
    private val sagaRepository: SagaStateRepository
) {
    @Transactional
    fun execute(orderId: Long) {
        val saga = SagaState(orderId = orderId, step = "STARTED")
        sagaRepository.save(saga)

        try {
            paymentService.charge(orderId)
            saga.step = "PAYMENT_DONE"
            sagaRepository.save(saga)

            inventoryService.reserve(orderId)
            saga.step = "COMPLETED"
            sagaRepository.save(saga)
        } catch (e: Exception) {
            compensate(saga)
        }
    }

    private fun compensate(saga: SagaState) {
        when (saga.step) {
            "PAYMENT_DONE" -> paymentService.refund(saga.orderId)
            // reverse in order
        }
        saga.step = "COMPENSATED"
        sagaRepository.save(saga)
    }
}

// Async: Spring Events + @Async or Kotlin Coroutines
// For complex sagas: Spring State Machine or Axon Saga
// Saga state persistence: JPA entity with (sagaId, step, status, createdAt)
```
