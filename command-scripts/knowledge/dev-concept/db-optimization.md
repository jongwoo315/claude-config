# Database Optimization Patterns

## Key Principles
- Measure first: `EXPLAIN ANALYZE` before indexing — intuition lies, query plans don't
- N+1 is the most common Django ORM perf killer — detect with `django-debug-toolbar` or `nplusone`
- Indexes speed reads but slow writes — index what you filter/join/order on, not everything
- Bulk operations over loops: `bulk_create`/`bulk_update` reduce round trips from N to 1

## When to Use
| Technique | Use When |
|-----------|----------|
| `select_related` | ForeignKey/OneToOne forward access (JOIN) |
| `prefetch_related` | Reverse FK, M2M, or filtered separate query |
| Composite index | Multi-column filter (`WHERE status = X AND created > Y`) |
| Partitioning | Table >50M rows, queries filter on partition key (date) |

## Decision Guide
1. Page slow? -> `django-debug-toolbar`, check query count + duplication
2. Query count scales with data? -> N+1, fix with `select_related`/`prefetch_related`
3. Single query slow? -> `EXPLAIN ANALYZE`, check full table scan, add index
4. Write+read heavy? -> Read replica via `DATABASE_ROUTERS`

## Code Smells
```python
# BAD: N+1 — each iteration fires a query
players = Player.objects.all()
for p in players:
    print(p.team.name)  # SELECT per iteration
# GOOD: JOIN in one query
players = Player.objects.select_related("team").all()
```
```python
# BAD: Create in loop
for item in items:
    Match.objects.create(field=item["field"])  # N INSERTs
# GOOD: Single bulk insert
Match.objects.bulk_create([Match(field=item["field"]) for item in items], batch_size=1000)
```
```python
# BAD: No index on filtered field
class Booking(models.Model):
    status = models.CharField(max_length=20)  # Filtered constantly, no index
# GOOD: Index + composite
class Booking(models.Model):
    status = models.CharField(max_length=20, db_index=True)
    created_at = models.DateTimeField(db_index=True)
    class Meta:
        indexes = [models.Index(fields=["status", "created_at"])]
```
```python
# BAD: SQL injection
cursor.execute(f"SELECT * FROM match WHERE id = {match_id}")
# GOOD: Parameterized
cursor.execute("SELECT * FROM match WHERE id = %s", [match_id])
```

## Common Mistakes
- `prefetch_related` where `select_related` suffices: extra query instead of JOIN
- `COUNT(*)` on large InnoDB tables: full scan, use approximation or cached count
- Not using `.only()`/`.defer()`: selecting 20 columns when you need 2
- `ORDER BY` non-indexed column with `LIMIT`: scans and sorts entire result set

## Stack Hints (Django ORM + MySQL)
- `django-debug-toolbar`: query count + duplication in dev
- `nplusone`: raises on N+1 queries in dev/test
- `EXPLAIN ANALYZE` (MySQL 8.0+): actual execution stats
- `django-mysql` `SmallSetPaginator`: avoids `COUNT(*)` on paginated queries
- Connection pooling: `django-db-connection-pool` or `ProxySQL` for MySQL

## Stack Hints (Spring Data JPA / Kotlin)
```kotlin
// N+1 방지: @EntityGraph (fetch join 선언적)
@EntityGraph(attributePaths = ["team", "venue"])
fun findAllByStatus(status: PlayerStatus): List<Player>

// Batch fetch: Hibernate default_batch_fetch_size
// application.yml: spring.jpa.properties.hibernate.default_batch_fetch_size: 100

// Bulk insert: saveAll + batch config
// spring.jpa.properties.hibernate.jdbc.batch_size: 50
// spring.jpa.properties.hibernate.order_inserts: true

// Projection: interface-based for lightweight reads (no entity overhead)
interface MatchSummary {
    val id: Long
    val title: String
    val playerCount: Int
}
fun findSummariesByStatus(status: MatchStatus): List<MatchSummary>

// QueryDSL for dynamic queries
fun searchMatches(cond: MatchSearchCondition): Page<MatchListDto> {
    val query = queryFactory.select(QMatch.match)
        .from(QMatch.match)
        .where(statusEq(cond.status), titleContains(cond.keyword))
    // ...
}

// Read replica: AbstractRoutingDataSource or spring.datasource.replicas config
// p6spy: SQL logging with actual parameter values in dev (hibernate show_sql 대신)
```
