"""
Response caching for the heavier read-only analytics/viz endpoints.

Uses the dedicated `default` cache (Redis DB 1 — see sadie/settings.py),
kept separate from Celery's broker/backend DB so a full `cache.clear()`
here never touches in-flight task state.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from functools import wraps

from django.core.cache import cache
from rest_framework.response import Response


def _cache_key_for(prefix: str, request) -> str:
    """Stable key derived from the view name + sorted query-string params."""
    params = sorted(request.GET.items())
    digest = hashlib.sha256(repr(params).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}"


def cached_response(timeout: int, key_prefix: str | None = None) -> Callable:
    """Cache a DRF `@api_view` function's Response.data for `timeout` seconds.

    Keyed on the view name (or `key_prefix`) plus the request's sorted query
    params, so different filter combinations don't collide.
    """

    def decorator(view_func: Callable) -> Callable:
        prefix = key_prefix or view_func.__name__

        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            key = _cache_key_for(prefix, request)
            cached = cache.get(key)
            if cached is not None:
                return Response(cached)
            response = view_func(request, *args, **kwargs)
            cache.set(key, response.data, timeout)
            return response

        return wrapper

    return decorator


def invalidate_stats_cache() -> None:
    """Clear every cached analytics/viz response.

    Called after data-changing batch operations (e.g. `import_partner_csv`)
    so results are fresh immediately rather than waiting out the TTL. Safe to
    call liberally — this cache DB holds nothing but these responses.
    """
    cache.clear()
