# Queue Patterns (Celery) — Quick Reference

## Key Principles
- **Every task needs max_retries and time_limit** — unbounded tasks leak workers
- **Idempotency by default** — any task may execute more than once (at-least-once delivery)
- **Backpressure over unbounded queues** — monitor queue depth, throttle at the source
- **Visibility timeout > task duration** — otherwise broker re-delivers mid-execution

## When to Use
| Pattern | Use Case |
|---------|----------|
| Retry + backoff | Transient failures (network, rate limit) |
| DLQ | Poison messages that always fail |
| Idempotency key | Payment, refund, any non-repeatable side effect |
| Rate limiting | External API with quota |
| Priority queues | User-facing vs background batch work |

## Code Smells
```python
# SMELL: task without max_retries — infinite retry loop
@app.task(bind=True)
def process(self, data):
    try: do_work(data)
    except Exception as exc: raise self.retry(exc=exc)  # forever

# SMELL: task without time_limit — hung HTTP blocks worker forever
@app.task
def sync_to_partner(data):
    requests.post(PARTNER_URL, json=data)  # no timeout, no time_limit

# SMELL: .delay() fire-and-forget — queue down = silent failure
def create_order(request):
    order = Order.objects.create(...)
    send_email.delay(order.id)  # no fallback, no logging
```

## Retry + DLQ Pattern
```python
@app.task(bind=True, max_retries=3, time_limit=60)
def process_payment(self, payment_id):
    try:
        charge(payment_id)
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            dead_letter.s(self.name, payment_id, str(exc)).apply_async(queue="dlq")
            return
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)
```

## Common Mistakes
- **No timeout on HTTP inside tasks** — one slow endpoint stalls all workers
- **Retry without backoff** — hammers failing service, worsens outage
- **Same queue for fast and slow tasks** — batch import blocks notifications
- **Assuming exactly-once** — Celery is at-least-once; design accordingly

## Stack Hints (Django / Celery / Redis)
```python
# celery.py — production defaults
app.conf.update(
    task_time_limit=300, task_soft_time_limit=240,
    task_acks_late=True, worker_prefetch_multiplier=1,
    task_reject_on_worker_lost=True, result_expires=3600,
)
# Rate limiting: @app.task(rate_limit="10/m", max_retries=3, time_limit=30)
# Priority: route tasks to queues via task_routes, run separate workers per queue
```

## Stack Hints (Spring / Kotlin)
```kotlin
// Spring AMQP (RabbitMQ) — retry + DLQ
@Configuration
class RabbitConfig {
    @Bean fun retryInterceptor() = RetryInterceptorBuilder.stateless()
        .maxAttempts(3).backOffOptions(1000, 2.0, 10000).build()
}

@RabbitListener(queues = ["payments"], concurrency = "3-10")
fun processPayment(message: PaymentMessage, channel: Channel, @Header(AmqpHeaders.DELIVERY_TAG) tag: Long) {
    try {
        paymentService.charge(message.paymentId)
        channel.basicAck(tag, false)
    } catch (e: Exception) {
        channel.basicNack(tag, false, false) // reject → DLQ
    }
}

// Kafka — with Spring Kafka
@KafkaListener(topics = ["orders"], groupId = "order-processor",
    containerFactory = "kafkaListenerContainerFactory")
fun handleOrder(record: ConsumerRecord<String, OrderEvent>) {
    // at-least-once: commit after processing (default)
    // idempotency: check processed set in Redis before processing
}

// application.yml — timeout + concurrency
// spring.rabbitmq.listener.simple.default-requeue-rejected: false  (→ DLQ)
// spring.kafka.consumer.max-poll-records: 100
```
