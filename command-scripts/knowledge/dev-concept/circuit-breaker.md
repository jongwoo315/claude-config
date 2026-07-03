# Circuit Breaker & Resilience Patterns

## Key Principles
- External services WILL fail — design for failure, not success
- Circuit breaker prevents cascade: stop calling a dead service instead of piling up timeouts
- Retry for transient failures; circuit breaker for sustained — use both, in the right order
- Bulkhead isolation: one failing integration must not starve resources from healthy ones
- Always set explicit timeouts — `requests.get()` with no timeout blocks indefinitely

## When to Use
| Pattern | Use When |
|---------|----------|
| **Retry** | Transient errors (network blip, 503). Max 2-3 attempts with backoff |
| **Circuit Breaker** | Sustained failures. Fail fast, check periodically for recovery |
| **Bulkhead** | Multiple external services. Isolate so one failure doesn't starve others |

## Decision Guide
1. Single flaky call? -> Retry with backoff (max 3)
2. Service repeatedly failing? -> Circuit breaker wrapping the retry
3. Call 3+ external APIs? -> Bulkhead: separate Celery queues per integration

## States: `CLOSED --(failures >= threshold)--> OPEN --(timeout)--> HALF-OPEN --(success)--> CLOSED`

## Code Smells
```python
# BAD: No timeout, unlimited retries
def send_alimtalk(phone, template, data):
    while True:
        try: return requests.post(KAKAO_API_URL, json=payload)  # No timeout!
        except Exception: time.sleep(1)  # Retries forever
# GOOD: Timeout + bounded retry + circuit breaker
@circuit_breaker(failure_threshold=5, recovery_timeout=60)
def send_alimtalk(phone, template, data):
    for attempt in range(3):
        try:
            resp = requests.post(KAKAO_API_URL, json=payload, timeout=(3, 10))
            resp.raise_for_status(); return resp
        except requests.exceptions.ConnectionError:
            if attempt == 2: raise
            time.sleep(2 ** attempt)
```
```python
# BAD: Catching all exceptions the same way
except Exception: logger.error("Something failed")
# GOOD: Differentiate retriable vs non-retriable
except requests.exceptions.Timeout: raise RetriableError()
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401: raise PermanentError()
```
```python
# BAD: Single Celery queue — KakaoPay outage blocks Alimtalk, SMS
# GOOD: Bulkhead — separate queues per integration
app.conf.task_routes = {
    "payments.tasks.*": {"queue": "kakaopay"},
    "notifications.tasks.alimtalk_*": {"queue": "alimtalk"},
}
```

## Common Mistakes
- No timeout on HTTP calls: hanging upstream locks Celery worker for `visibility_timeout`
- Retrying non-idempotent ops: double-charging via KakaoPay on retried 500
- Circuit breaker per-process only: use Redis-backed state for cross-worker sharing
- No alerting on OPEN state: trips silently, nobody notices

## Stack Hints (Django + Celery + Redis)
- `pybreaker` for circuit breaker; store state in Redis for cross-worker sharing
- Celery: `autoretry_for`, `max_retries=3`, `retry_backoff=True`
- Celery: set `task_time_limit` and `task_soft_time_limit`
- Redis: circuit state as `circuit:{service}` with TTL = recovery_timeout

## Stack Hints (Spring / Kotlin)
```kotlin
// Resilience4j — Spring Boot auto-configuration
// build.gradle.kts: implementation("io.github.resilience4j:resilience4j-spring-boot3")

@Service
class AlimtalkService(private val restTemplate: RestTemplate) {
    @CircuitBreaker(name = "kakao", fallbackMethod = "fallbackSend")
    @Retry(name = "kakao")
    @TimeLimiter(name = "kakao")
    fun send(phone: String, template: String, data: Map<String, Any>): AlimtalkResult {
        return restTemplate.postForObject("/send", AlimtalkRequest(phone, template, data))!!
    }

    fun fallbackSend(phone: String, template: String, data: Map<String, Any>, ex: Throwable): AlimtalkResult {
        log.warn("Alimtalk circuit open, queuing for retry", ex)
        return AlimtalkResult.QUEUED  // fallback: queue to DB for later retry
    }
}

// application.yml
// resilience4j.circuitbreaker.instances.kakao:
//   failure-rate-threshold: 50
//   wait-duration-in-open-state: 60s
//   sliding-window-size: 10
// resilience4j.retry.instances.kakao:
//   max-attempts: 3
//   wait-duration: 1s
//   exponential-backoff-multiplier: 2
// resilience4j.timelimiter.instances.kakao:
//   timeout-duration: 10s

// Bulkhead: @Bulkhead(name = "kakao", type = Bulkhead.Type.THREADPOOL)
// Monitoring: Actuator + Micrometer → Datadog (resilience4j metrics auto-exported)
```
