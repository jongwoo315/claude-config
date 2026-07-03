# Contract Testing

## Key Principles
- **Contracts define the boundary, not the implementation**: A contract specifies request/response shapes, status codes, and field types — not business logic.
- **Consumer-driven**: The frontend (consumer) declares what it needs; the backend (provider) verifies it can deliver. Contracts flow upstream.
- **Breaking change = contract violation**: If the contract test passes, the deploy is safe for consumers. If it fails, stop and coordinate.
- **Contracts are living documentation**: The contract IS the API spec. It cannot drift because tests enforce it.

## When to Use
- Backend and frontend are deployed independently (separate repos, separate CI/CD).
- Multiple consumers depend on the same API (web, mobile, internal services).
- "Frontend broke after backend deploy" has happened more than once.
- NOT needed for: monolithic apps where frontend and backend are tested together in integration tests.

## Decision Guide
- **Schema validation only?** Use `drf-spectacular` + generated OpenAPI schema + schema diff in CI. Lowest effort.
- **Consumer-driven contracts?** Use Pact when consumers have specific field/format requirements the provider must preserve.
- **Full contract testing?** Combine schema validation (structure) with Pact (consumer expectations) for high-confidence deploys.
- Start with schema validation in CI. Add Pact only when you have multiple consumers or cross-team API boundaries.

## Code Smells

```python
# SMELL: no schema validation — API shape changes silently
class BookingViewSet(viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    # Rename a field, frontend breaks on next deploy, caught by users

# BETTER: schema snapshot test in CI
# tests/test_schema.py
from drf_spectacular.generators import SchemaGenerator

def test_api_schema_no_breaking_changes():
    schema = SchemaGenerator().get_schema()
    current = export_schema(schema)
    baseline = load_baseline("api_schema_baseline.json")
    breaking = detect_breaking_changes(baseline, current)
    assert not breaking, f"Breaking changes detected: {breaking}"
```

```python
# SMELL: manual API docs that drift from implementation
# docs/api.md says: {"booking_id": int, "status": string}
# Actual response: {"id": int, "booking_status": string, "status" removed 3 months ago}

# BETTER: generate docs from schema, validate responses in tests
from rest_framework.test import APIClient

def test_booking_response_matches_contract():
    client = APIClient()
    resp = client.get("/api/bookings/1/")
    assert "booking_id" in resp.json()  # consumer expects this field
    assert isinstance(resp.json()["booking_id"], int)
    assert resp.json()["status"] in ["confirmed", "cancelled", "pending"]
```

```python
# SMELL: provider tests only — no consumer perspective
# Backend tests verify "response is 200" but not "response has fields frontend needs"

# BETTER: consumer-driven contract (Pact-style)
# Consumer side (frontend repo) defines:
expected_response = {
    "booking_id": Like(123),        # must be int
    "user_name": Like("John"),      # must be string
    "status": Term("confirmed", r"confirmed|cancelled|pending"),
}

# Provider side (Django repo) verifies it can produce this:
# pact-verifier --provider-base-url=http://localhost:8000 \
#   --pact-url=pacts/frontend-backend.json
```

## Common Mistakes
- **Testing implementation, not contract**: Contract tests should not assert DB state or internal logic.
- **Storing contracts in a shared repo without versioning**: Use Pact Broker or version contract files alongside consumer code.
- **Only testing happy paths**: Contracts should cover error responses too (`4xx` shapes, error message format).
- **Making contract tests flaky**: Use deterministic data. No real DB calls in consumer tests — mock the provider.
- **Ignoring additive changes**: Adding a new field is safe. Removing or renaming is breaking. Enforce this distinction in CI.

## Stack Hints (Django / DRF / Frontend)
- **Schema generation**: `drf-spectacular` generates OpenAPI 3.0 from DRF serializers and viewsets.
- **Schema diff in CI**: `oasdiff` or `openapi-diff` to detect breaking changes against a baseline schema.
- **Pact (Python provider)**: `pact-python` for provider verification against consumer-generated pacts.
- **Response validation**: `jsonschema` or DRF serializer `.is_valid()` in tests to assert response structure.
- **CI pipeline**: Generate schema -> diff against baseline -> fail on breaking changes -> update baseline on merge.

## Stack Hints (Spring / Kotlin)
```kotlin
// Spring Cloud Contract — provider-side contract definition
// contracts/shouldReturnBooking.groovy (or Kotlin DSL)
// Contract.make {
//     request { method GET(); url "/api/bookings/1" }
//     response { status 200; body(bookingId: 1, status: "confirmed") }
// }

// Auto-generated tests from contracts:
// build.gradle.kts: id("org.springframework.cloud.contract") version "..."
// → generates test class that hits your controller and validates response shape

// springdoc-openapi: runtime schema generation from Spring MVC
// implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui")
@Operation(summary = "Get booking detail")
@ApiResponse(responseCode = "200", content = [Content(schema = Schema(implementation = BookingDto::class))])
@GetMapping("/bookings/{id}")
fun getBooking(@PathVariable id: Long): BookingDto

// Schema diff in CI: springdoc generates openapi.json → oasdiff against baseline
// REST Docs alternative: Spring REST Docs (test-driven API docs, no runtime annotation)
// implementation("org.springframework.restdocs:spring-restdocs-mockmvc")
```
