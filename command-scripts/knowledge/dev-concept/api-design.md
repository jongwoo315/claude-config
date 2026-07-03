# REST API Design

## Key Principles
- **Consistency over cleverness** — one naming convention, one error format, one pagination style across all endpoints.
- Every list endpoint gets **pagination from day one**. Retrofitting pagination is a breaking change.
- Unsafe operations (POST/PUT/DELETE) need **idempotency** unless you enjoy debugging duplicate charges.
- URLs are nouns (`/matches/`), HTTP methods are verbs. No `/getMatch` or `/createMatch`.

## When to Use
- Richardson Level 2 (HTTP verbs + status codes + resources) is the right default for most Django APIs.
- Level 3 (HATEOAS) only if clients are truly generic/discoverable (rare — internal APIs almost never need it).
- Consider GraphQL instead when: clients need wildly different response shapes, or N+1 API calls are the norm.

## Decision Guide
| Choice | Option A | Option B | Default |
|---|---|---|---|
| **Versioning** | URL (`/v1/`) | Header (`Accept-Version`) | URL — simpler to debug, cache, route |
| **Pagination** | Offset (`?page=3`) | Cursor (`?after=abc`) | Cursor for large/changing datasets; offset for admin/backoffice |
| **Naming** | snake_case | camelCase | snake_case (Python ecosystem); pick one and enforce |
| **Filtering** | Query params | POST body | Query params for GET; POST body only for complex search |

## Code Smells

```python
# BAD: inconsistent error formats across endpoints
# Endpoint A: {"error": "not found"}
# Endpoint B: {"detail": "Not found", "code": 404}
# Endpoint C: {"message": "Resource not found", "errors": []}

# GOOD: one error schema, enforced via exception handler
# Always: {"type": "error_code", "message": "Human text", "details": {...}}
class StandardException(APIException):
    def __init__(self, error_type, message, details=None, status_code=400):
        self.detail = {"type": error_type, "message": message, "details": details or {}}
        self.status_code = status_code
```

```python
# BAD: list endpoint with no pagination — works today, OOM tomorrow
class MatchListView(ListAPIView):
    queryset = Match.objects.all()
    serializer_class = MatchSerializer

# GOOD: cursor pagination for feed-style data
class MatchListView(ListAPIView):
    queryset = Match.objects.order_by('-created_at')
    serializer_class = MatchSerializer
    pagination_class = CursorPagination
```

```python
# BAD: POST without idempotency — double-tap creates duplicate
class PaymentCreateView(CreateAPIView):
    serializer_class = PaymentSerializer

# GOOD: client sends Idempotency-Key header
class PaymentCreateView(CreateAPIView):
    def create(self, request, *args, **kwargs):
        idem_key = request.headers.get("Idempotency-Key")
        if idem_key and (cached := cache.get(f"idempotency:{idem_key}")):
            return Response(cached)
        response = super().create(request, *args, **kwargs)
        if idem_key:
            cache.set(f"idempotency:{idem_key}", response.data, timeout=86400)
        return response
```

## Common Mistakes
- Returning 200 for everything and stuffing error info in the body
- Nested URL hell (`/teams/1/matches/2/players/3/stats/`) — flatten after 2 levels
- Exposing internal IDs (auto-increment) — use UUIDs or hashids for public APIs
- Mixed snake_case and camelCase in the same response

## Stack Hints (Django/Celery/Redis)
- DRF `DEFAULT_PAGINATION_CLASS` in settings — set globally, override per-view
- `djangorestframework-camel-case` if frontend demands camelCase (transform at boundary, keep snake internally)
- Redis for idempotency key storage (natural TTL support)
- DRF `EXCEPTION_HANDLER` setting — single place to enforce error format

## Stack Hints (Spring / Kotlin)
```kotlin
// Consistent error format via @RestControllerAdvice
@RestControllerAdvice
class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException::class)
    fun handleBusiness(ex: BusinessException) = ResponseEntity
        .status(ex.status)
        .body(ErrorResponse(type = ex.errorType, message = ex.message, details = ex.details))
}
data class ErrorResponse(val type: String, val message: String?, val details: Map<String, Any> = emptyMap())

// Pagination — Spring Data Pageable
@GetMapping("/matches")
fun listMatches(pageable: Pageable): Page<MatchListDto> = matchService.findAll(pageable)
// Cursor pagination: custom Slice-based implementation with keyset (WHERE id > :lastId)

// Idempotency key via filter
@Component
class IdempotencyFilter(private val redisTemplate: StringRedisTemplate) : OncePerRequestFilter() {
    override fun doFilterInternal(req: HttpServletRequest, resp: HttpServletResponse, chain: FilterChain) {
        val key = req.getHeader("Idempotency-Key") ?: return chain.doFilter(req, resp)
        val cached = redisTemplate.opsForValue().get("idempotency:$key")
        if (cached != null) { resp.writer.write(cached); return }
        chain.doFilter(req, resp)  // store result in Redis after response
    }
}

// Kotlin data class DTOs — immutable, concise
data class MatchCreateRequest(val title: String, val maxPlayers: Int, val venueId: Long)
// Jackson: spring.jackson.property-naming-strategy: SNAKE_CASE (전역 설정)
```
