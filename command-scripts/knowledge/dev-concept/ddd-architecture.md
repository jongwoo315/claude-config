# DDD Architecture

## Key Principles
- **Ubiquitous Language**: domain experts and code use the same terms — no translation layer
- **Bounded Contexts**: each context owns its models, language, and rules — no shared models across boundaries
- **Aggregates**: consistency boundary around a cluster of entities — one transaction per aggregate
- **Domain logic in domain layer only**: business rules never leak into views, serializers, or tasks
- **Anti-Corruption Layer (ACL)**: cross-context communication goes through ACL, never direct import

## When to Use
| Signal | DDD helps |
|--------|-----------|
| Same entity name means different things in different modules | Bounded Context separation |
| Business rules scattered across views, serializers, tasks | Domain layer extraction |
| Single model with 30+ fields serving multiple use cases | Aggregate decomposition |
| Cross-module imports creating circular dependencies | ACL + explicit boundaries |
| "God model" that every feature touches | Aggregate root identification |

## Decision Guide
1. **Start coarse** — fewer bounded contexts, split when pain emerges
2. **Aggregate sizing** — if a transaction spans multiple entities, your aggregate boundary is wrong
3. **Domain Events** — only introduce when contexts genuinely need decoupling, not prematurely
4. **Repository pattern** — useful when you need to abstract data access, overkill for simple CRUD

## Code Smells
```python
# SMELL 1: Business logic in view/serializer
class MatchViewSet(viewsets.ModelViewSet):
    def perform_create(self, serializer):
        if self.request.user.balance < serializer.validated_data['price']:
            raise ValidationError("Insufficient balance")
        self.request.user.balance -= serializer.validated_data['price']
        # ❌ Domain logic belongs in domain layer, not view

# SMELL 2: God model
class Match(models.Model):
    # 40+ fields: scheduling, pricing, players, venue, weather, analytics...
    # ❌ Multiple aggregates collapsed into one model

# SMELL 3: Cross-boundary direct import
from payments.models import PaymentTransaction  # in matches app
# ❌ Should go through ACL or domain event

# SMELL 4: Shared model across contexts
# Both "matches" and "analytics" directly query the same Match model
# ❌ Each context should own its representation
```

## Common Mistakes
| Mistake | Fix |
|---------|-----|
| Too many bounded contexts upfront | Start with 2-3, split when you feel the pain |
| Aggregate too large | If transactions span multiple entities, boundaries are wrong |
| Skipping ACL | Cross-context calls MUST go through ACL — never direct import |
| Premature domain events | Only when contexts genuinely need decoupling |
| Repository pattern everywhere | Skip for simple CRUD — Django ORM is already a repository |
| DDD in simple CRUD apps | DDD adds overhead — only use when domain complexity justifies it |

## Stack Hints (Django / Celery)
- **Django**: apps = bounded contexts, `models.py` per app = aggregate roots, `services.py` or `domain/` for domain logic
- **Layer convention**: `views.py` (interface) → `services.py` (application) → `domain/` (domain) → `models.py` (infrastructure)
- **Domain events via Celery**: `post_save` signal → Celery task in consuming context (loose coupling)
- **ACL implementation**: thin adapter module per context boundary (e.g., `matches/adapters/payments.py`)

## Stack Hints (Spring / Kotlin)
```kotlin
// Bounded Context = Gradle/Maven module or package
// match/ (context) → domain/, application/, infrastructure/, interfaces/

// Aggregate root with Kotlin sealed class for domain events
@Entity
class Match private constructor(/* ... */) {
    fun cancel(reason: String): MatchCancelled {
        check(status == MatchStatus.ACTIVE) { "Cannot cancel non-active match" }
        this.status = MatchStatus.CANCELLED
        return MatchCancelled(matchId = id, reason = reason)
    }
}

// Value Object as data class
data class Money(val amount: BigDecimal, val currency: Currency) {
    init { require(amount >= BigDecimal.ZERO) { "Amount must be non-negative" } }
}

// Domain event as sealed interface
sealed interface MatchEvent { val matchId: Long }
data class MatchCancelled(override val matchId: Long, val reason: String) : MatchEvent

// ACL: anti-corruption layer between contexts
@Component
class PaymentAdapter(private val paymentClient: PaymentClient) {
    fun refund(matchId: Long, amount: Money): RefundResult =
        paymentClient.requestRefund(matchId, amount.amount).toDomain()
}

// Layer: Controller → ApplicationService → Domain → Repository(interface)
// Spring module convention: :match-domain (no Spring deps), :match-app, :match-infra
```
