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
    GET visitors-new-returning/   -> monthly new vs returning visitor counts
    GET activity-by-weekday/      -> event and interaction counts by weekday
    GET category-trends/          -> monthly category interaction trends
    GET top-venues/               -> top locations by event count and interactions
    GET engagement/               -> engagement metrics (buzz, current vs previous month)
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Sum
from django.db.models.functions import ExtractIsoWeekDay, TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Category
from organisations.models import Location, Organisation

from .models import UserHashInteraction
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
    rows = list(interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n"))
    return Response({"filters": p, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_stats(request: Request, event_id: int) -> Response:
    """Per-event interaction analytics: unique visitors, total count, monthly series."""

    qs = UserHashInteraction.objects.filter(event_id=event_id)
    unique_users = qs.values("user_hash").distinct().count()
    total = qs.count()
    by_month = (
        qs.annotate(month=TruncMonth("interaction_date")).values("month").annotate(count=Count("id")).order_by("month")
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
    by_area = list(postcodes.values("area").annotate(total=Sum("interaction_count")).order_by("-total"))
    by_postcode = list(
        postcodes.values("postcode", "area").annotate(total=Sum("interaction_count")).order_by("-total")
    )
    return Response(
        {
            "filters": p,
            "by_area": by_area,
            "by_postcode": by_postcode,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def headline(request: Request) -> Response:
    """Headline stats for org insights: events & attendees last month vs month before.

    Returns:
    {
        "filters": {...},
        "scope_label": "Plymouth Arts Centre" or "City (all)",
        "current_period": {
            "period_start": "2025-12-01",
            "period_end": "2025-12-31",
            "events_count": 42,
            "attendees_count": 1234
        },
        "previous_period": {
            "period_start": "2025-11-01",
            "period_end": "2025-11-30",
            "events_count": 38,
            "attendees_count": 1100
        },
        "deltas": {
            "events_pct_change": 10.5,  # positive means increase
            "attendees_pct_change": 12.2
        }
    }
    """
    p = parse_filter_params(request)

    # Determine scope label (org name or "City (all)").
    scope_label = "City (all)"
    if p.get("org"):
        try:
            org_id = int(p["org"])
            org = Organisation.objects.get(pk=org_id)
            scope_label = org.name
        except (TypeError, ValueError, Organisation.DoesNotExist):
            pass

    # Calculate previous calendar month.
    today = date.today()
    # First day of this month
    first_of_this_month = date(today.year, today.month, 1)
    # Last day of previous month
    last_of_prev_month = first_of_this_month - timedelta(days=1)
    # First day of previous month
    first_of_prev_month = date(last_of_prev_month.year, last_of_prev_month.month, 1)
    # First day of month before that
    first_of_prev_prev_month = date(
        (first_of_prev_month - timedelta(days=1)).year, (first_of_prev_month - timedelta(days=1)).month, 1
    )
    last_of_prev_prev_month = first_of_prev_month - timedelta(days=1)

    # Get filtered querysets.
    _, events, interactions, _ = _filtered(request)

    # Current period (previous calendar month).
    curr_events = events.filter(
        start_datetime__date__gte=first_of_prev_month, start_datetime__date__lte=last_of_prev_month
    ).count()
    curr_attendees = (
        interactions.filter(interaction_date__gte=first_of_prev_month, interaction_date__lte=last_of_prev_month)
        .values("user_hash")
        .distinct()
        .count()
    )

    # Previous period (month before that).
    prev_events = events.filter(
        start_datetime__date__gte=first_of_prev_prev_month, start_datetime__date__lte=last_of_prev_prev_month
    ).count()
    prev_attendees = (
        interactions.filter(
            interaction_date__gte=first_of_prev_prev_month, interaction_date__lte=last_of_prev_prev_month
        )
        .values("user_hash")
        .distinct()
        .count()
    )

    # Calculate deltas.
    events_pct_change = (
        round(((curr_events - prev_events) / max(1, prev_events)) * 100, 1)
        if prev_events > 0
        else (100.0 if curr_events > 0 else 0.0)
    )
    attendees_pct_change = (
        round(((curr_attendees - prev_attendees) / max(1, prev_attendees)) * 100, 1)
        if prev_attendees > 0
        else (100.0 if curr_attendees > 0 else 0.0)
    )

    return Response(
        {
            "filters": p,
            "scope_label": scope_label,
            "current_period": {
                "period_start": first_of_prev_month.isoformat(),
                "period_end": last_of_prev_month.isoformat(),
                "events_count": curr_events,
                "attendees_count": curr_attendees,
            },
            "previous_period": {
                "period_start": first_of_prev_prev_month.isoformat(),
                "period_end": last_of_prev_prev_month.isoformat(),
                "events_count": prev_events,
                "attendees_count": prev_attendees,
            },
            "deltas": {
                "events_pct_change": events_pct_change,
                "attendees_pct_change": attendees_pct_change,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def visitors_new_returning(request: Request) -> Response:
    """Monthly new vs returning visitor counts.

    A visitor is "new" if their first interaction falls within the month;
    "returning" if they had prior interactions.

    Returns: {
        "filters": {...},
        "series": [
            {"month": "2025-01", "new": 42, "returning": 128},
            ...
        ]
    }
    """
    p, _, interactions, _ = _filtered(request)

    # Get all interactions with their user's first-seen date
    all_interactions = list(
        interactions.values("user_hash", "interaction_date").order_by("user_hash", "interaction_date")
    )

    # Build first-seen map
    first_seen = {}
    for interaction in all_interactions:
        user_hash = interaction["user_hash"]
        if user_hash not in first_seen:
            first_seen[user_hash] = interaction["interaction_date"]

    # Bin interactions by month into new/returning
    monthly_data = {}
    for interaction in all_interactions:
        user_hash = interaction["user_hash"]
        interaction_date = interaction["interaction_date"]
        month_key = interaction_date.strftime("%Y-%m") if interaction_date else None

        if not month_key:
            continue

        if month_key not in monthly_data:
            monthly_data[month_key] = {"new": 0, "returning": 0}

        # Check if this is the first interaction for this user (in any month)
        if first_seen[user_hash] == interaction_date:
            monthly_data[month_key]["new"] += 1
        else:
            monthly_data[month_key]["returning"] += 1

    series = [{"month": month, **counts} for month, counts in sorted(monthly_data.items())]

    return Response(
        {
            "filters": p,
            "series": series,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def activity_by_weekday(request: Request) -> Response:
    """Event count and interaction count by weekday (0=Monday, 6=Sunday).

    Returns: {
        "filters": {...},
        "series": [
            {"weekday": 0, "weekday_name": "Monday", "events": 12, "interactions": 456},
            ...
        ]
    }
    """
    p, events, interactions, _ = _filtered(request)

    weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    event_by_dow = events.annotate(dow=ExtractIsoWeekDay("start_datetime")).values("dow").annotate(count=Count("id"))

    interaction_by_dow = (
        interactions.annotate(dow=ExtractIsoWeekDay("interaction_date")).values("dow").annotate(count=Count("id"))
    )

    # Convert to dicts (0-indexed Monday; ExtractIsoWeekDay: 1=Mon, 7=Sun)
    event_dict = {item["dow"] - 1: item["count"] for item in event_by_dow}
    interaction_dict = {item["dow"] - 1: item["count"] for item in interaction_by_dow}

    series = [
        {
            "weekday": i,
            "weekday_name": weekday_names[i],
            "events": event_dict.get(i, 0),
            "interactions": interaction_dict.get(i, 0),
        }
        for i in range(7)
    ]

    return Response(
        {
            "filters": p,
            "series": series,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def category_trends(request: Request) -> Response:
    """Monthly interaction counts grouped by category.

    Returns: {
        "filters": {...},
        "series": [
            {"month": "2025-01", "category": "Music", "count": 123},
            ...
        ]
    }
    """
    p, events, interactions, _ = _filtered(request)

    # Get categories and build interaction data by month and category
    rows = (
        interactions.select_related("event")
        .annotate(month=TruncMonth("interaction_date"))
        .values("month", "event__categories__name")
        .annotate(count=Count("id"))
        .order_by("month", "event__categories__name")
    )

    series = []
    for row in rows:
        if row["event__categories__name"]:  # Skip NULL categories
            series.append(
                {
                    "month": row["month"].date().isoformat() if row["month"] else None,
                    "category": row["event__categories__name"],
                    "count": row["count"],
                }
            )

    return Response(
        {
            "filters": p,
            "series": series,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def top_venues(request: Request) -> Response:
    """Top locations (venues) by event count and interaction count.

    Returns: {
        "filters": {...},
        "results": [
            {
                "location_id": 42,
                "name": "Central Hall",
                "organisation": "Plymouth Arts Centre",
                "event_count": 12,
                "interaction_count": 456
            },
            ...
        ]
    }
    """
    p, events, interactions, _ = _filtered(request)
    limit = int(request.GET.get("limit", "20"))

    # Get events at each location
    event_counts = (
        events.select_related("location", "organisation")
        .values("location_id", "location__name", "organisation__name")
        .annotate(event_count=Count("id"))
        .order_by("-event_count")
    )

    # Build interaction counts by location
    interaction_counts = (
        interactions.select_related("event__location")
        .filter(event__location_id__isnull=False)
        .values("event__location_id")
        .annotate(interaction_count=Count("id"))
    )
    interaction_map = {row["event__location_id"]: row["interaction_count"] for row in interaction_counts}

    results = []
    for event_row in event_counts[:limit]:
        location_id = event_row["location_id"]
        results.append(
            {
                "location_id": location_id,
                "name": event_row["location__name"],
                "organisation": event_row["organisation__name"],
                "event_count": event_row["event_count"],
                "interaction_count": interaction_map.get(location_id, 0),
            }
        )

    return Response(
        {
            "filters": p,
            "results": results,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def engagement(request: Request) -> Response:
    """Engagement metrics: current month vs previous, plus buzz (interactions per event).

    Returns: {
        "filters": {...},
        "current_month_interactions": 1234,
        "current_month_events": 42,
        "previous_month_interactions": 1100,
        "previous_month_events": 38,
        "buzz_current": 29.4,  # interactions / events
        "buzz_previous": 28.9,
        "buzz_change": 0.5  # percentage change
    }
    """
    p = parse_filter_params(request)

    today = date.today()
    first_of_this_month = date(today.year, today.month, 1)
    last_of_prev_month = first_of_this_month - timedelta(days=1)
    first_of_prev_month = date(last_of_prev_month.year, last_of_prev_month.month, 1)

    # Get filtered querysets
    _, events, interactions, _ = _filtered(request)

    # Current month
    curr_events_count = events.filter(
        start_datetime__date__gte=first_of_this_month,
    ).count()
    curr_interactions_count = interactions.filter(
        interaction_date__gte=first_of_this_month,
    ).count()

    # Previous month
    prev_events_count = events.filter(
        start_datetime__date__gte=first_of_prev_month,
        start_datetime__date__lte=last_of_prev_month,
    ).count()
    prev_interactions_count = interactions.filter(
        interaction_date__gte=first_of_prev_month,
        interaction_date__lte=last_of_prev_month,
    ).count()

    # Calculate buzz (interactions per event)
    buzz_current = curr_interactions_count / max(1, curr_events_count)
    buzz_previous = prev_interactions_count / max(1, prev_events_count)
    buzz_change = (
        round(((buzz_current - buzz_previous) / max(0.1, buzz_previous)) * 100, 1) if buzz_previous > 0 else 0.0
    )

    return Response(
        {
            "filters": p,
            "current_month_interactions": curr_interactions_count,
            "current_month_events": curr_events_count,
            "previous_month_interactions": prev_interactions_count,
            "previous_month_events": prev_events_count,
            "buzz_current": round(buzz_current, 1),
            "buzz_previous": round(buzz_previous, 1),
            "buzz_change": buzz_change,
        }
    )
