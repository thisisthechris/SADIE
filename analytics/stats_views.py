"""
Aggregate stats endpoints for the SPA dashboard.

These views return the same numbers as the Django-template dashboard pages
in ``dashboard/views.py`` — by using the shared ``analytics.queries`` helpers
they are guaranteed to stay in sync.

All endpoints accept the same query-string filter schema (see
``analytics.queries.parse_filter_params``):

    org, category, date_from, date_to, search, period, itype

Endpoints (mounted at /api/analytics/stats/):

    GET summary/                  -> top-line counts for the home page
    GET top-orgs/                 -> top organisations by event count
    GET top-categories/           -> top categories by event count
    GET interactions-timeseries/  -> monthly interaction counts
    GET interactions-by-type/     -> breakdown by interaction_type
    GET postcode-aggregates/      -> per-area sums for the choropleth
"""

from __future__ import annotations

from datetime import date

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Category
from organisations.models import Location, Organisation

from .queries import (
    events_qs,
    interactions_qs,
    parse_filter_params,
    postcode_qs,
)


def _filtered(request: Request):
    p = parse_filter_params(request)
    return p, events_qs(p), interactions_qs(p), postcode_qs(p)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def summary(request: Request) -> Response:
    """Top-line counts for the SPA home page."""
    p, events, interactions, postcodes = _filtered(request)
    upcoming = (
        events.select_related("organisation", "location")
        .filter(start_datetime__gte=date.today())
        .order_by("start_datetime")
        .values(
            "id",
            "title",
            "start_datetime",
            "url",
            "image_url",
            "organisation_id",
            "organisation__name",
            "location_id",
            "location__name",
        )[:10]
    )
    return Response(
        {
            "filters": p,
            "org_count": Organisation.objects.count(),
            "location_count": Location.objects.count(),
            "event_count": events.count(),
            "interaction_count": interactions.count(),
            "unique_visitors": interactions.values("user_hash").distinct().count(),
            "postcode_count": postcodes.aggregate(t=Sum("interaction_count"))["t"] or 0,
            "upcoming_events": list(upcoming),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def top_orgs(request: Request) -> Response:
    """Top organisations by filtered-event count."""
    p, events, _, _ = _filtered(request)
    limit = int(request.GET.get("limit", "10"))
    rows = list(
        events.values("organisation_id", "organisation__name", "organisation__slug")
        .annotate(n=Count("id"))
        .order_by("-n")[:limit]
    )
    return Response({"filters": p, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def top_categories(request: Request) -> Response:
    """Top categories by filtered-event count."""
    p, events, _, _ = _filtered(request)
    limit = int(request.GET.get("limit", "12"))
    rows = list(
        Category.objects.filter(events__in=events)
        .values("id", "name", "slug")
        .annotate(n=Count("events"))
        .order_by("-n")[:limit]
    )
    return Response({"filters": p, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def interactions_timeseries(request: Request) -> Response:
    """Monthly interaction totals for the journeys page line chart."""
    p, _, interactions, _ = _filtered(request)
    rows = (
        interactions.annotate(month=TruncMonth("interaction_date"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    series = [
        {
            "month": (
                r["month"].date().isoformat()
                if hasattr(r["month"], "date")
                else (r["month"].isoformat() if r["month"] else None)
            ),
            "count": r["count"],
        }
        for r in rows
    ]
    return Response({"filters": p, "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def interactions_by_type(request: Request) -> Response:
    """Breakdown of interactions by ``interaction_type``."""
    p, _, interactions, _ = _filtered(request)
    rows = list(
        interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n")
    )
    return Response({"filters": p, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_stats(request: Request, event_id: int) -> Response:
    """Per-event interaction analytics: unique visitors, total count, monthly series."""
    from .models import UserHashInteraction

    qs = UserHashInteraction.objects.filter(event_id=event_id)
    unique_users = qs.values("user_hash").distinct().count()
    total = qs.count()
    by_month = (
        qs.annotate(month=TruncMonth("interaction_date"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    series = [
        {
            "month": r["month"].date().isoformat() if hasattr(r["month"], "date") else r["month"].isoformat(),
            "count": r["count"],
        }
        for r in by_month
    ]
    return Response(
        {
            "event_id": event_id,
            "unique_users": unique_users,
            "total_interactions": total,
            "by_month": series,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_aggregates(request: Request) -> Response:
    """Per-postcode-area sums of interaction count.

    Used to drive both the legacy 2D bubble map and the upcoming 3D
    extruded choropleth in Phase 3. Rows include the raw postcode so the
    SPA can do its own district-prefix grouping if needed.
    """
    p, _, _, postcodes = _filtered(request)
    by_area = list(
        postcodes.values("area")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")
    )
    by_postcode = list(
        postcodes.values("postcode", "area")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")
    )
    return Response(
        {
            "filters": p,
            "by_area": by_area,
            "by_postcode": by_postcode,
        }
    )
