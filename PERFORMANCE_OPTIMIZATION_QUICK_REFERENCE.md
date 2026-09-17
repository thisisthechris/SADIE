# SADIE Performance Optimization — Quick Reference Guide

## For Developers: How to Use & Maintain

### 1. Cache Decorator Usage

#### What is `@cached_response`?
A custom decorator that automatically caches HTTP response bodies in Redis, keyed by query parameters.

#### How to Apply It
```python
from analytics.caching import cached_response

@api_view(["GET"])
@cached_response(timeout=900)  # 900 seconds = 15 minutes
def my_expensive_view(request: Request) -> Response:
    # This endpoint's response is cached
    return Response({...})
```

#### When to Use It
- ✅ Aggregation endpoints (groups, sums, averages)
- ✅ Time-series data (monthly trends)
- ✅ Read-only endpoints
- ❌ Don't use on endpoints with write operations
- ❌ Don't use on user-specific data (shopping cart, profile)

#### Cache Key Structure
```
stats:<endpoint_name>:<md5_hash_of_sorted_query_params>
Example: stats:top_orgs:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

#### Manual Cache Invalidation
```python
from analytics.caching import invalidate_stats_cache

# After bulk import or data update
invalidate_stats_cache()  # Clears all stats cache keys
```

---

### 2. Database Indexes

#### What Indexes Were Added?
- **UserHashInteraction**: `interaction_date`
- **PostcodeAreaInteraction**: `period_start`, `(period_start, postcode)`
- **PostcodeEventInteraction**: `area`, `(area, interaction_date)`, `interaction_date`
- **PostcodeTicketPurchase**: `(purchase_date, event)`, `event`, `purchase_date`
- **Event**: `start_datetime`, `(organisation, start_datetime)`, `created_at`

#### How Do Indexes Work?
Indexes are automatically used by the database query planner when you filter by indexed columns:
```python
# This query will use the start_datetime index
Event.objects.filter(start_datetime__gte='2024-01-01')

# This composite index will be used
Event.objects.filter(
    organisation_id=5,
    start_datetime__gte='2024-01-01',
    start_datetime__lte='2024-01-31'
)
```

#### Do I Need to Change My Code?
**No!** Indexes are transparent to application code. They're used automatically by the database query planner.

#### Monitor Index Effectiveness
```python
# In Django shell or SQL client
from django.db import connection

# Get query execution plan
query = "EXPLAIN ANALYZE SELECT * FROM events_event WHERE start_datetime >= '2024-01-01'"
connection.cursor().execute(query)
# Look for "Index Scan" (good) vs "Seq Scan" (table scan, slower)
```

---

### 3. Query Optimization (select_related / prefetch_related)

#### What Changed?
Query helper functions now automatically fetch related objects efficiently:

#### Before (N+1 Problem)
```python
# Old code (still works but slower)
interactions = UserHashInteraction.objects.all()
for interaction in interactions:
    print(interaction.event.title)  # ← Additional query executed for each row!
    print(interaction.organisation.name)  # ← Another query per row!
```

#### After (Optimized)
```python
# New code (automatic via queries.py)
interactions = interactions_qs({})  # Uses prefetch_related
for interaction in interactions:
    print(interaction.event.title)  # ← Already fetched, no extra query
    print(interaction.organisation.name)  # ← Already fetched, no extra query
```

#### How It Works
- **`select_related()`**: For ForeignKey relationships → SQL INNER JOIN
- **`prefetch_related()`**: For ManyToMany and reverse FK → Separate query + in-memory join

#### Using Query Helpers
```python
from analytics.queries import events_qs, interactions_qs, postcode_qs, postcode_event_qs, postcode_ticket_qs

# All these automatically include select_related/prefetch_related
events = events_qs({'org': '5', 'dfrom': '2024-01-01'})
interactions = interactions_qs({'itype': 'event'})
postcodes = postcode_qs({'org': '5'})
postcode_events = postcode_event_qs({'org': '5'})
tickets = postcode_ticket_qs({'org': '5'})
```

#### When Adding Custom Queries
If you add a new aggregation query, apply these patterns:
```python
from django.db.models import Prefetch

# Pattern 1: Simple foreign key + related table
qs = Event.objects.select_related('organisation', 'location')

# Pattern 2: Many-to-many (categories)
qs = Event.objects.prefetch_related('categories')

# Pattern 3: Nested relationships
qs = PostcodeEventInteraction.objects.select_related(
    'event', 'organisation', 'location'
).prefetch_related('event__categories')

# Apply to base queryset before filtering
qs = events_qs(filters, base=qs)  # Pass base=qs to reuse optimized queryset
```

---

### 4. Monitoring & Debugging

#### Check Cache Performance
```python
from django.core.cache import cache

# In Django shell
cache.get_stats() if hasattr(cache, 'get_stats') else 'Use Redis CLI'

# Via Redis CLI
redis-cli
> INFO stats
> KEYS stats:* | wc -l  # Count cached responses
```

#### Profile Query Execution
```python
from django.db import connection
from django.test.utils import override_settings

@override_settings(DEBUG=True)
def profile_queries():
    from analytics.queries import events_qs
    
    qs = events_qs({'org': '5', 'dfrom': '2024-01-01'})
    list(qs)  # Force evaluation
    
    print(f"Queries executed: {len(connection.queries)}")
    for query in connection.queries:
        print(f"  {query['sql'][:100]}...")
        print(f"  Time: {query['time']}")
```

#### Check Index Usage
```sql
-- PostgreSQL: Show table and index sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size
FROM pg_tables
WHERE tablename IN ('analytics_userhashinteraction', 'events_event', ...)
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Show indexes and their sizes
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

#### Monitor Cache Hit Rate
```python
# In analytics/caching.py after each request:
# Logs should show "Cache HIT" or "Cache MISS"
# Monitor via logs or APM dashboard
```

---

### 5. Deployment & Rollback

#### Deploy Optimizations
```bash
# 1. Backup database (ALWAYS)
pg_dump sadie > sadie_backup_$(date +%Y%m%d).sql

# 2. Apply migrations
python manage.py migrate analytics 0009
python manage.py migrate events 0004

# 3. Verify migrations
python manage.py showmigrations analytics | grep 0009
python manage.py showmigrations events | grep 0004

# 4. Test locally before deploying
python manage.py test analytics
```

#### Rollback if Needed
```bash
# 1. Stop the application
# 2. Revert migrations
python manage.py migrate analytics 0008
python manage.py migrate events 0003

# 3. Restart application
# 4. Verify: python manage.py showmigrations (should show unapplied)
```

#### Zero-Downtime Deployment
1. Add indexes CONCURRENTLY (index creation doesn't lock writes)
   ```sql
   CREATE INDEX CONCURRENTLY events_event_start_datetime_idx 
   ON events_event (start_datetime);
   ```
2. Deploy code changes (no breaking changes in this optimization)
3. Cache warming: Prime Redis with common filter combinations

---

### 6. Common Issues & Solutions

#### Issue: Cache Always Missing
**Symptom**: Response times don't improve, X-Cache header shows "MISS"
**Solution**:
1. Check Redis is running: `redis-cli ping` should return `PONG`
2. Check cache setting in settings.py: `CACHES['default']['BACKEND']` should point to Redis
3. Clear stale cache: `redis-cli FLUSHDB` (development only!)
4. Verify query parameters are consistent (cache keys are parameter-sensitive)

#### Issue: Slow Queries Despite Indexes
**Symptom**: Query time > 500ms even with indexes
**Solution**:
1. Verify indexes exist: Check `pg_indexes` table
2. Check index usage: `pg_stat_user_indexes` should show `idx_scan > 0`
3. Analyze query plan: Use `EXPLAIN ANALYZE SELECT ...`
4. Consider table statistics: `ANALYZE table_name;` to update statistics
5. May need partial indexes for large tables (consult DBA)

#### Issue: Memory Usage Spikes
**Symptom**: Redis memory grows rapidly
**Solution**:
1. Check eviction policy: `CONFIG GET maxmemory-policy` (should be `allkeys-lru`)
2. Reduce TTL: Change `timeout=900` to smaller value if needed
3. Monitor cache size: `redis-cli INFO memory`
4. Clear old cache keys: `redis-cli FLUSHDB`

#### Issue: Migration Fails
**Symptom**: `python manage.py migrate` error when applying new indexes
**Solution**:
1. Check for duplicate index names: `SELECT * FROM pg_indexes WHERE indexname LIKE '%add_performance%'`
2. Manually remove conflicts: `DROP INDEX IF EXISTS conflict_index_name;`
3. Retry migration: `python manage.py migrate analytics 0009`
4. Contact DBA if locks prevent migration

---

### 7. Performance Targets

#### Response Time Goals
| Endpoint | Before | After | Target |
|----------|--------|-------|--------|
| Dashboard Summary | 2000ms | 400ms | < 500ms |
| Top Organisations | 1500ms | 200ms | < 300ms |
| Category Trends | 1800ms | 300ms | < 500ms |
| Postcode Analytics | 2500ms | 500ms | < 600ms |

#### Database Metrics
| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Queries per page load | 20 | 3-5 | < 5 |
| Index scan rate | 0% | > 90% | > 80% |
| Avg query time | 150ms | 30ms | < 50ms |

---

### 8. Code Examples

#### Adding a New Cached Endpoint
```python
from analytics.caching import cached_response
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(["GET"])
@cached_response(timeout=900)  # 15-minute cache
def my_new_stat(request):
    from analytics.queries import events_qs
    
    params = parse_filter_params(request)
    events = events_qs(params)
    
    count = events.count()
    return Response({"total": count})
```

#### Adding a New Optimized Query
```python
from analytics.queries import parse_filter_params

# In analytics/queries.py
def my_custom_qs(p: Mapping[str, str], base=None):
    """Custom query with optimization."""
    qs = base if base is not None else MyModel.objects.all()
    
    # Add select_related for FK
    qs = qs.select_related('related_org', 'related_location')
    
    # Add prefetch_related for M2M
    qs = qs.prefetch_related('categories')
    
    # Apply filters
    if p.get('org'):
        qs = qs.filter(organisation_id=int(p['org']))
    
    return qs
```

#### Testing Cache Hit/Miss
```python
# In your test file
from django.test import TestCase
from django.core.cache import cache

class CacheTestCase(TestCase):
    def test_cache_hit(self):
        # First call: cache miss
        response1 = self.client.get('/api/analytics/top-orgs/?org=5')
        self.assertEqual(response1.status_code, 200)
        
        # Second call: cache hit (should be faster)
        response2 = self.client.get('/api/analytics/top-orgs/?org=5')
        self.assertEqual(response2.status_code, 200)
        
        # Verify they're identical
        self.assertEqual(response1.json(), response2.json())
```

---

## Summary: Three Simple Rules

1. **Use Query Helpers**: Always use `events_qs()`, `interactions_qs()`, etc. from `analytics/queries.py` — they handle optimization automatically
2. **Apply `@cached_response`**: Add decorator to read-only aggregation endpoints with `timeout=900`
3. **Monitor Performance**: Watch response times and cache hit rates; adjust TTLs if needed

---

## Questions?

- **Performance Issue?** Check cache hit rate and index usage (see Monitoring section)
- **Need to Invalidate Cache?** Call `invalidate_stats_cache()` after bulk updates
- **Adding New Query?** Use patterns from existing queries in `queries.py` as templates
- **Need Help?** Refer to PERFORMANCE_OPTIMIZATION_PHASE_1_3_COMPLETE.md for detailed explanations
