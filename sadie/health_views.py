"""
Health check endpoints for monitoring and orchestration.

Provides liveness and readiness probes for container health checks,
load balancers, and Kubernetes deployments.

Readiness Probe Behavior:
- CRITICAL FAILURES (return 503):
  - Database connectivity issues → service cannot function
- NON-CRITICAL WARNINGS (return 200 with warning):
  - Cache/Redis connectivity issues → service can still serve requests,
    but some features (caching, Celery tasks) may be degraded

Endpoints:
    GET /health/live/      Liveness probe (Django is running)
    GET /health/ready/     Readiness probe (all critical services ready)
"""

from __future__ import annotations

import logging

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

logger = logging.getLogger(__name__)


def _check_database() -> bool:
    """Check if database connection is working (CRITICAL).

    Returns False if database is unavailable, preventing readiness.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {type(e).__name__}")
        return False


def _check_cache() -> bool:
    """Check if cache (Redis) is working (NON-CRITICAL).

    Returns False if cache fails, but doesn't prevent readiness since
    Django can still function without cache (performance degradation only).
    """
    try:
        cache.set("health_check", "ok", timeout=10)
        return cache.get("health_check") == "ok"
    except Exception as e:
        logger.warning(f"Cache health check failed (non-critical): {type(e).__name__}")
        # Returning False but this is non-critical for readiness
        return False


@api_view(["GET"])
@permission_classes([AllowAny])
def live(request):
    """Liveness probe: returns 200 if the application is running.

    Use this in container health checks and load balancer pings.
    """
    return JsonResponse({"status": "alive", "service": "django"}, status=200)


@api_view(["GET"])
@permission_classes([AllowAny])
def ready(request):
    """Readiness probe: returns 200 if service can accept traffic.

    Critical Checks (must pass):
    - Database connectivity

    Non-Critical Warnings (failure logged but doesn't block traffic):
    - Redis/cache connectivity

    HTTP Status Codes:
    - 200: Service is ready to accept traffic
    - 503: Service is NOT ready (critical dependencies failed)

    Use this in Kubernetes readiness probes or before accepting traffic.
    """
    db_ok = _check_database()
    cache_ok = _check_cache()

    # Determine readiness based on critical checks only
    is_ready = db_ok

    # Build response with all check statuses
    checks = {
        "database": "ok" if db_ok else "failed",
        "cache": "ok" if cache_ok else "warning",
    }

    if is_ready:
        return JsonResponse(
            {
                "status": "ready",
                "service": "django",
                "checks": checks,
            },
            status=200,
        )
    else:
        return JsonResponse(
            {
                "status": "not_ready",
                "service": "django",
                "checks": checks,
            },
            status=503,
        )

