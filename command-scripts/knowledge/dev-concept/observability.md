# Observability

## Key Principles
- **Three pillars are complementary, not redundant**: Metrics tell you WHAT is wrong, logs tell you WHY, traces tell you WHERE in the call chain.
- **Structured logging from day one**: JSON logs with consistent fields (`request_id`, `user_id`, `action`) — grep is not an observability strategy.
- **Alert on symptoms, not causes**: Alert on SLO breaches (error rate > 1%, p99 latency > 500ms), not individual errors.
- **Every request gets a trace ID**: Propagate `request_id` through Django, Celery tasks, and Redis operations.

## When to Use
- Any system serving real users where "it feels slow" is not an acceptable diagnostic.
- Multi-service or Django + Celery architectures where a request spans multiple processes.
- When you need SLI/SLO commitments (even internal ones).

## Decision Guide
- Start with **structured logging** (lowest effort, highest immediate value).
- Add **metrics** (Datadog StatsD / DogStatsD) for request rate, error rate, latency histograms.
- Add **distributed tracing** (ddtrace) when requests cross process boundaries (Django -> Celery).
- Define SLIs before building dashboards. Dashboard without SLI = vanity metrics.

## Code Smells

```python
# BAD: print debugging in production
print(f"Processing order {order_id}")  # no structure, lost in stdout

# GOOD: structured logging with trace context
import structlog
logger = structlog.get_logger()
logger.info("order.processing", order_id=order_id, user_id=user_id)
```

```python
# BAD: no request_id propagation to Celery
@shared_task
def process_payment(order_id):
    logger.info("processing payment")  # which request triggered this?

# GOOD: propagate correlation ID
@shared_task(bind=True)
def process_payment(self, order_id, request_id=None):
    structlog.contextvars.bind_contextvars(request_id=request_id)
    logger.info("payment.processing", order_id=order_id)
```

```python
# BAD: alert on every error — leads to alert fatigue
# Alert: "ERROR occurred in views.py" -> 200 alerts/day -> ignored

# GOOD: alert on error RATE breaching SLO
# SLI: error_rate = 5xx_responses / total_responses
# SLO: error_rate < 1% over 5-minute window
# Alert only when SLO is breached
```

## Common Mistakes
- Logging sensitive data (passwords, tokens, PII) in structured logs.
- Creating dashboards before defining what "healthy" looks like (define SLIs first).
- Using `WARNING` level for expected conditions — log levels lose meaning.
- Not setting log sampling in high-throughput paths (100% trace sampling kills performance and budget).

## Stack Hints (Django / Celery / Redis / Datadog)
- **Django**: `django-structlog` + `ddtrace-run` for auto-instrumented traces.
- **Celery**: `ddtrace` patches Celery automatically; pass `request_id` via task kwargs or headers.
- **Redis**: Datadog traces Redis commands automatically via `ddtrace.patch(redis=True)`.
- **Middleware**: Add a `RequestIDMiddleware` that generates/extracts `X-Request-ID` and binds to `structlog.contextvars`.

## Stack Hints (Spring / Kotlin)
```kotlin
// Structured logging: kotlin-logging + Logback JSON encoder
private val log = KotlinLogging.logger {}
log.info { "order.processing" }  // MDC context auto-included

// MDC propagation via filter
@Component
class RequestIdFilter : OncePerRequestFilter() {
    override fun doFilterInternal(req: HttpServletRequest, resp: HttpServletResponse, chain: FilterChain) {
        val requestId = req.getHeader("X-Request-ID") ?: UUID.randomUUID().toString()
        MDC.put("requestId", requestId)
        resp.setHeader("X-Request-ID", requestId)
        try { chain.doFilter(req, resp) } finally { MDC.clear() }
    }
}

// Micrometer metrics → Datadog
// implementation("io.micrometer:micrometer-registry-datadog")
@Timed(value = "match.search", histogram = true)  // latency histogram auto-exported
fun searchMatches(query: String): List<Match> { /* ... */ }

// Custom business metric
@Component
class OrderMetrics(private val meterRegistry: MeterRegistry) {
    fun recordOrderCreated(amount: Double) {
        meterRegistry.counter("order.created").increment()
        meterRegistry.summary("order.amount").record(amount)
    }
}

// Spring Boot Actuator: /actuator/health, /actuator/metrics, /actuator/prometheus
// Distributed tracing: Micrometer Tracing (formerly Spring Cloud Sleuth) — auto-propagates traceId
// Async propagation: TaskDecorator for @Async, or Kotlin coroutines MDC context
```
