# Caching Strategies (Redis + Django)

## Key Principles
- Cache is a **performance optimization**, not a data store. Code must work without it.
- Every cache key needs a **TTL** and an **invalidation strategy** decided upfront.
- Cache the **result**, not the query. Serialize to the simplest possible form.
- Name keys with structure: `{app}:{model}:{id}:{variant}` (e.g. `matches:match:42:detail`).

## When to Use
- Read-heavy endpoints (>10:1 read/write ratio)
- Expensive aggregations or joins that change infrequently
- Session/config data that rarely mutates
- **Skip** for: user-specific mutable data that changes per request, data requiring real-time accuracy

## Decision Guide
| Pattern | Use When | Tradeoff |
|---|---|---|
| **Cache-aside** (lazy) | Read-heavy, tolerates stale | Simple; risk of stampede |
| **Write-through** | Must stay fresh, moderate writes | Always consistent; write latency |
| **Write-behind** | High write volume, async OK | Fast writes; complexity + data loss risk |

Invalidation: **TTL** for "good enough" freshness. **Event-based** (signal/Celery) for consistency-critical paths. Combine both as default.

## Code Smells

```python
# BAD: no TTL, no invalidation plan — stale forever
cache.set(f"user_{user.id}_profile", profile_data)

# GOOD: TTL + event invalidation
cache.set(f"users:profile:{user.id}", profile_data, timeout=300)

@receiver(post_save, sender=User)
def invalidate_profile_cache(sender, instance, **kwargs):
    cache.delete(f"users:profile:{instance.id}")
```

```python
# BAD: cache stampede — 1000 requests hit DB simultaneously on expiry
def get_leaderboard():
    data = cache.get("leaderboard")
    if data is None:
        data = compute_leaderboard()  # expensive
        cache.set("leaderboard", data, timeout=60)
    return data

# GOOD: lock-based stampede prevention
def get_leaderboard():
    data = cache.get("leaderboard")
    if data is None:
        if cache.add("leaderboard:lock", "1", timeout=10):  # acquired
            data = compute_leaderboard()
            cache.set("leaderboard", data, timeout=60)
            cache.delete("leaderboard:lock")
        else:
            time.sleep(0.2)  # or return stale/fallback
            data = cache.get("leaderboard")
    return data
```

## Common Mistakes
- Caching querysets directly (not serializable, holds DB connections)
- Key collision across environments — prefix with `{env}:` in settings
- Forgetting to invalidate on **related model** changes (e.g. cache match detail, team name changes)
- Using `cache.clear()` in production — nukes everything, including sessions

## Stack Hints (Django/Celery/Redis)
- `django-redis` as cache backend; use `LOCATION` with `redis://` URI
- Celery beat for periodic cache warming of expensive aggregations
- `Redis.pipeline()` for batch invalidation of related keys
- `CACHE_MIDDLEWARE_SECONDS` for view-level caching; prefer explicit `cache.get/set` for control

## Stack Hints (Spring / Kotlin)
```kotlin
// Spring Cache abstraction — @Cacheable + @CacheEvict
@Service
class MatchService(private val matchRepository: MatchRepository) {
    @Cacheable(value = ["matches"], key = "#matchId")
    fun getMatchDetail(matchId: Long): MatchDetailDto = matchRepository.findDetail(matchId)

    @CacheEvict(value = ["matches"], key = "#matchId")
    @Transactional
    fun updateMatch(matchId: Long, dto: MatchUpdateDto): Match { /* ... */ }
}

// Stampede prevention with @Cacheable sync
@Cacheable(value = ["leaderboard"], sync = true)  // only one thread computes on miss
fun getLeaderboard(): List<LeaderboardEntry> = computeExpensiveLeaderboard()

// application.yml
// spring.cache.type: redis
// spring.data.redis.host: localhost
// spring.cache.redis.time-to-live: 300s
// spring.cache.redis.key-prefix: "app:"

// Manual Redis for fine-grained control
@Component
class CacheHelper(private val redisTemplate: RedisTemplate<String, Any>) {
    fun invalidatePattern(pattern: String) {
        val keys = redisTemplate.keys(pattern)
        if (keys.isNotEmpty()) redisTemplate.delete(keys)
    }
}
```
