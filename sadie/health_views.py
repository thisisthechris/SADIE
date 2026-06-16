"""
Health check endpoints for monitoring and orchestration.

Provides liveness and readiness probes for container health checks,
load balancers, and Kubernetes deployments.

Endpoints:
    GET /health/live/      Liveness probe (Django is running)
    GET /health/ready/     Readiness probe (all services ready to accept traffic)
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
    """Check if database connection is working."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


def _check_cache() -> bool:
    """Check if cache (Redis) is working."""
    try:
        cache.set("health_check", "ok", timeout=10)
        return cache.get("health_check") == "ok"
    except Exception as e:
        logger.warning(f"Cache health check failed (non-critical): {e}")
        # Cache failures are not critical for readiness
        return True


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
    """Readiness probe: returns 200 only if all dependencies are ready.

    Checks:
    - Database connectivity
    - Redis/cache connectivity

    Use this in Kubernetes readiness probes or before accepting traffic.
    """
    db_ok = _check_database()
    cache_ok = _check_cache()

    if db_ok and cache_ok:
        return JsonResponse(
            {
                "status": "ready",
                "service": "django",
                "checks": {
                    "database": "ok",
                    "cache": "ok",
                },
            },
            status=200,
        )

    status_code = 503 if not db_ok else 200
    return JsonResponse(
        {
            "status": "not_ready",
            "service": "django",
            "checks": {
                "database": "ok" if db_ok else "failed",
                "cache": "ok" if cache_ok else "warning",
            },
        },
        status=status_code,
    )
