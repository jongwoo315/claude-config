# CQRS — Command Query Responsibility Segregation

## Key Principles
- **Reads and writes have different optimization needs.** Separate them when those needs diverge significantly.
- Read models are **denormalized projections** optimized for specific queries. Write models enforce **invariants and business rules**.
- Eventual consistency is the tradeoff. If you cannot tolerate stale reads (even briefly), CQRS adds pain without value.
- CQRS does **not** require event sourcing. Start without it. Add events only if you need an audit log or temporal queries.

## When to Use
- Read/write ratio is heavily skewed (100:1+) and read queries are complex (joins, aggregations)
- Read and write shapes are fundamentally different (list view vs creation form)
- Performance: write path needs transactional integrity, read path needs speed
- **Skip when**: simple CRUD, small dataset, team is unfamiliar with pattern, reads and writes look similar

## Decision Guide
| Signal | Plain Django | CQRS Worth Considering |
|---|---|---|
| View serializer has >3 `SerializerMethodField` | Maybe | Yes |
| Queryset uses `annotate()` + `Subquery` + `Prefetch` | Tolerable | Strong signal |
| Same endpoint is slow for reads AND writes | Optimize query | Separate models |
| Write validation is trivial | Plain CRUD | No need |
| Need real-time dashboard from transactional data | N/A | Yes — read model + async projection |

## Code Smells

```python
# SMELL: view queryset doing heavy lifting that screams "read model"
class MatchListView(ListAPIView):
    def get_queryset(self):
        return Match.objects.annotate(
            player_count=Count('participants'),
            avg_rating=Avg('participants__rating'),
            host_name=F('host__username'),
            venue_name=F('venue__name'),
            is_full=Case(
                When(player_count__gte=F('max_players'), then=True),
                default=False, output_field=BooleanField(),
            ),
        ).select_related('host', 'venue').order_by('-created_at')

# BETTER: materialized read model, updated on write
class MatchListEntry(models.Model):
    """Denormalized read model — updated via signals/Celery on match changes."""
    match = models.OneToOneField(Match, on_delete=models.CASCADE)
    player_count = models.IntegerField(default=0)
    avg_rating = models.FloatField(null=True)
    host_name = models.CharField(max_length=150)
    venue_name = models.CharField(max_length=255)
    is_full = models.BooleanField(default=False)
    created_at = models.DateTimeField()

    class Meta:
        indexes = [models.Index(fields=['-created_at'])]
```

```python
# SMELL: write API returning fully hydrated response (coupling read shape to write path)
class MatchCreateView(CreateAPIView):
    serializer_class = MatchDetailSerializer  # 15 fields, nested, annotated

# BETTER: write returns minimal confirmation, client fetches read model separately
class MatchCreateView(CreateAPIView):
    serializer_class = MatchWriteSerializer  # only writable fields

    def perform_create(self, serializer):
        match = serializer.save()
        update_match_read_model.delay(match.id)  # async projection
        return match  # response: {id, status, created_at} — that's it
```

## Common Mistakes
- Building full event sourcing when a simple denormalized table would suffice
- Forgetting to handle the projection failure (Celery task fails, read model is stale forever)
- Creating read models for simple queries that `select_related` already handles well
- Not indexing the read model — defeats the entire purpose
- Synchronous projection in the request cycle (negates the write-path speed benefit)

## Stack Hints (Django/Celery/Redis)
- Write path: normal Django models + DRF serializers with validation
- Read path: separate model/table, separate serializer, separate viewset
- Projection: Celery task triggered by `post_save` signal or explicit command
- Redis pub/sub or Django signals for triggering projections; Celery for the actual work
- `django-pgviews` or raw `CREATE MATERIALIZED VIEW` for SQL-level read models (refresh via Celery beat)
- Keep write and read serializers in the same `serializers.py` but name clearly: `MatchWriteSerializer`, `MatchListReadSerializer`

## Stack Hints (Spring / Kotlin)
```kotlin
// Write side: JPA Entity + Command handler
@Entity @Table(name = "match")
class Match(/* rich domain model with validation */)

data class CreateMatchCommand(val title: String, val maxPlayers: Int)

@Service
class MatchCommandService(private val matchRepo: MatchRepository,
                          private val eventPublisher: ApplicationEventPublisher) {
    @Transactional
    fun create(cmd: CreateMatchCommand): Long {
        val match = Match.create(cmd)
        matchRepo.save(match)
        eventPublisher.publishEvent(MatchCreated(match.id))
        return match.id
    }
}

// Read side: lightweight projection (Spring Data JDBC or JdbcTemplate)
@Table("match_list_view")
data class MatchListEntry(val matchId: Long, val title: String, val playerCount: Int, val isFull: Boolean)

@Repository
interface MatchReadRepository : CrudRepository<MatchListEntry, Long> {
    fun findAllByOrderByCreatedAtDesc(pageable: Pageable): Page<MatchListEntry>
}

// Projection updater: @TransactionalEventListener + @Async
@Component
class MatchProjectionUpdater(private val jdbcTemplate: JdbcTemplate) {
    @Async @TransactionalEventListener
    fun onMatchCreated(event: MatchCreated) {
        jdbcTemplate.update("INSERT INTO match_list_view (...) SELECT ... FROM match WHERE id = ?", event.matchId)
    }
}
// Alternative: Spring Data JPA @Immutable entity mapped to DB view (CREATE VIEW)
```
