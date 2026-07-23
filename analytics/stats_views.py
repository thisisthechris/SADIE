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
    GET peak-times/               -> event count by hour-of-day
    GET attendance-frequency/     -> distribution of events attended per visitor
    GET event-lead-time/          -> avg days between scrape and event, by org
    GET lead-time-trend/          -> monthly avg scrape-to-event lead time
    GET peak-times-by-postcode/   -> interaction volume by daypart, per postcode district
    GET event-types-by-postcode/  -> interaction volume by event category, per postcode district
    GET postcode-engagement-trend/ -> monthly interaction totals, top 5 postcode districts
    GET ticket-volume-trend/      -> monthly ticket-purchase volume (tickets + orders)
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Category
from organisations.models import Location, Organisation

from .models import UserHashInteraction
from .queries import (
    district_of,
    events_qs,
    interactions_qs,
    parse_filter_params,
    postcode_event_qs,
    postcode_qs,
    postcode_ticket_qs,
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

    # NOTE: explicit .order_by() is required on both queries below — otherwise
    # Django adds each model's default Meta.ordering field (Event's
    # "start_datetime" / UserHashInteraction's "-interaction_date") to the
    # GROUP BY clause, splitting a weekday's rows into multiple 1-count groups
    # that then silently overwrite each other in the dict comprehension below.
    event_by_dow = (
        events.annotate(dow=ExtractIsoWeekDay("start_datetime")).values("dow").annotate(count=Count("id")).order_by()
    )

    interaction_by_dow = (
        interactions.annotate(dow=ExtractIsoWeekDay("interaction_date"))
        .values("dow")
        .annotate(count=Count("id"))
        .order_by()
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
            month = row["month"]
            series.append(
                {
                    "month": (
                        month.date().isoformat()
                        if hasattr(month, "date")
                        else (month.isoformat() if month else None)
                    ),
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


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def peak_times(request: Request) -> Response:
    """Event count by hour-of-day (0-23), based on ``start_datetime``.

    Returns: {
        "filters": {...},
        "series": [
            {"hour": 0, "label": "00:00", "events": 3},
            ...
            {"hour": 23, "label": "23:00", "events": 1}
        ]
    }
    """
    p, events, _, _ = _filtered(request)

    # NOTE: explicit .order_by("hour") is required — otherwise Django adds
    # Event's default Meta.ordering ("start_datetime") to the GROUP BY clause,
    # splitting events that share an hour but differ in exact start_datetime.
    by_hour = (
        events.annotate(hour=ExtractHour("start_datetime"))
        .values("hour")
        .annotate(count=Count("id"))
        .order_by("hour")
    )
    hour_dict = {row["hour"]: row["count"] for row in by_hour}

    series = [
        {
            "hour": h,
            "label": f"{h:02d}:00",
            "events": hour_dict.get(h, 0),
        }
        for h in range(24)
    ]

    return Response({"filters": p, "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def attendance_frequency(request: Request) -> Response:
    """Distribution of how many distinct events each visitor has attended.

    "Attended" = has an ``interaction_type="event"`` interaction tied to that
    event. Bucketed as 1 / 2 / 3 / 4+ events attended.

    Returns: {
        "filters": {...},
        "series": [
            {"bucket": "1", "visitors": 120},
            {"bucket": "2", "visitors": 54},
            {"bucket": "3", "visitors": 21},
            {"bucket": "4+", "visitors": 18}
        ],
        "summary": {
            "total_visitors": 213,
            "gt3_count": 18,
            "gt3_pct": 8.5
        }
    }
    """
    p, _, interactions, _ = _filtered(request)

    # NOTE: explicit .order_by() is required — otherwise Django adds
    # UserHashInteraction's default Meta.ordering ("-interaction_date") to the
    # GROUP BY clause, splitting a visitor's rows across multiple groups.
    per_user = (
        interactions.filter(interaction_type="event", event_id__isnull=False)
        .values("user_hash")
        .annotate(n=Count("event_id", distinct=True))
        .order_by()
    )

    buckets = {"1": 0, "2": 0, "3": 0, "4+": 0}
    total_visitors = 0
    gt3_count = 0
    for row in per_user:
        n = row["n"]
        total_visitors += 1
        if n >= 4:
            buckets["4+"] += 1
            gt3_count += 1
        elif n == 3:
            buckets["3"] += 1
        elif n == 2:
            buckets["2"] += 1
        elif n == 1:
            buckets["1"] += 1

    series = [{"bucket": b, "visitors": buckets[b]} for b in ["1", "2", "3", "4+"]]
    gt3_pct = round((gt3_count / total_visitors) * 100, 1) if total_visitors else 0.0

    return Response(
        {
            "filters": p,
            "series": series,
            "summary": {
                "total_visitors": total_visitors,
                "gt3_count": gt3_count,
                "gt3_pct": gt3_pct,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_lead_time(request: Request) -> Response:
    """Average lead time (days) between an event being scraped in and taking place.

    ``lead_days = start_datetime - created_at``. Events with a negative lead
    (backdated/backfilled listings created after their start date) are
    excluded from the averages but counted in ``excluded_count``.

    Returns: {
        "filters": {...},
        "overall_avg_days": 12.4,
        "excluded_count": 3,
        "by_org": [
            {"organisation_id": 1, "organisation__name": "Org A", "avg_days": 14.2, "event_count": 40},
            ...
        ]
    }
    """
    p, events, _, _ = _filtered(request)

    with_lead = events.annotate(
        lead=ExpressionWrapper(F("start_datetime") - F("created_at"), output_field=DurationField())
    )
    excluded_count = with_lead.filter(lead__lt=timedelta(0)).count()
    valid = with_lead.filter(lead__gte=timedelta(0))

    overall = valid.aggregate(avg_lead=Avg("lead"))["avg_lead"]
    overall_avg_days = round(overall.total_seconds() / 86400, 1) if overall else 0.0

    by_org_rows = (
        valid.values("organisation_id", "organisation__name")
        .annotate(avg_lead=Avg("lead"), event_count=Count("id"))
        .order_by("-event_count")
    )
    by_org = [
        {
            "organisation_id": row["organisation_id"],
            "organisation__name": row["organisation__name"],
            "avg_days": round(row["avg_lead"].total_seconds() / 86400, 1) if row["avg_lead"] else 0.0,
            "event_count": row["event_count"],
        }
        for row in by_org_rows
    ]

    return Response(
        {
            "filters": p,
            "overall_avg_days": overall_avg_days,
            "excluded_count": excluded_count,
            "by_org": by_org,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def lead_time_trend(request: Request) -> Response:
    """Monthly average lead time (days) between scrape and event date.

    Grouped by the event's ``start_datetime`` month. Same exclusion rule as
    ``event_lead_time`` (negative leads dropped).

    Returns: {
        "filters": {...},
        "series": [
            {"month": "2025-01", "avg_days": 10.5},
            ...
        ]
    }
    """
    p, events, _, _ = _filtered(request)

    with_lead = events.annotate(
        lead=ExpressionWrapper(F("start_datetime") - F("created_at"), output_field=DurationField())
    ).filter(lead__gte=timedelta(0))

    rows = (
        with_lead.annotate(month=TruncMonth("start_datetime"))
        .values("month")
        .annotate(avg_lead=Avg("lead"))
        .order_by("month")
    )

    series = [
        {
            "month": r["month"].date().isoformat() if hasattr(r["month"], "date") else r["month"].isoformat(),
            "avg_days": round(r["avg_lead"].total_seconds() / 86400, 1) if r["avg_lead"] else 0.0,
        }
        for r in rows
        if r["month"]
    ]

    return Response({"filters": p, "series": series})


DAYPARTS = ["Morning", "Afternoon", "Evening", "Night"]


def _daypart(hour: int) -> str:
    """Bucket an hour-of-day (0-23) into one of four dayparts."""
    if 5 <= hour <= 11:
        return "Morning"
    if 12 <= hour <= 16:
        return "Afternoon"
    if 17 <= hour <= 20:
        return "Evening"
    return "Night"


def _top_districts_limit(request: Request, default: int = 8, maximum: int = 20) -> int:
    try:
        return max(1, min(int(request.GET.get("limit", str(default))), maximum))
    except (TypeError, ValueError):
        return default


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def peak_times_by_postcode(request: Request) -> Response:
    """Interaction volume by daypart (Morning/Afternoon/Evening/Night), per postcode district.

    Sourced from ``PostcodeEventInteraction`` (has an event FK, so we can read the
    event's ``start_datetime`` hour) weighted by ``interaction_count``. Limited to
    the top ``limit`` districts (default 8, max 20) by total volume.

    Returns: {
        "filters": {...},
        "dayparts": ["Morning", "Afternoon", "Evening", "Night"],
        "districts": ["PL1", "PL4", ...],  # ranked by total volume desc
        "series": [{"district": "PL1", "daypart": "Morning", "count": 42}, ...]
    }
    """
    p = parse_filter_params(request)
    limit = _top_districts_limit(request)

    # NOTE: explicit .order_by() below — see the GROUP BY gotcha documented on
    # activity_by_weekday()/peak_times() above; PostcodeEventInteraction has a
    # Meta.ordering that would otherwise leak into the GROUP BY clause.
    rows = (
        postcode_event_qs(p)
        .filter(event__isnull=False, event__start_datetime__isnull=False)
        .annotate(hour=ExtractHour("event__start_datetime"))
        .values("postcode", "area", "hour")
        .annotate(n=Sum("interaction_count"))
        .order_by()
    )

    totals: dict[str, dict[str, int]] = {}
    for row in rows:
        d = district_of(row["postcode"]) or district_of(row["area"])
        if not d:
            continue
        bucket = _daypart(row["hour"])
        entry = totals.setdefault(d, {b: 0 for b in DAYPARTS})
        entry[bucket] += int(row["n"] or 0)

    ranked = sorted(totals.items(), key=lambda kv: -sum(kv[1].values()))[:limit]
    districts = [d for d, _ in ranked]
    series = [{"district": d, "daypart": b, "count": counts[b]} for d, counts in ranked for b in DAYPARTS]

    return Response({"filters": p, "dayparts": DAYPARTS, "districts": districts, "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_types_by_postcode(request: Request) -> Response:
    """Interaction volume by event category, per postcode district.

    Sourced from ``PostcodeEventInteraction`` joined to the event's categories,
    weighted by ``interaction_count``. Limited to the top ``limit`` districts
    (default 8, max 20) by total volume; all categories present across those
    districts are included.

    Returns: {
        "filters": {...},
        "categories": ["Music", "Theatre", ...],
        "districts": ["PL1", "PL4", ...],  # ranked by total volume desc
        "series": [{"district": "PL1", "category": "Music", "count": 42}, ...]
    }
    """
    p = parse_filter_params(request)
    limit = _top_districts_limit(request)

    rows = (
        postcode_event_qs(p)
        .filter(event__isnull=False)
        .values("postcode", "area", "event__categories__name")
        .annotate(n=Sum("interaction_count"))
        .order_by()
    )

    totals: dict[str, dict[str, int]] = {}
    categories: set[str] = set()
    for row in rows:
        cat = row["event__categories__name"]
        if not cat:
            continue
        d = district_of(row["postcode"]) or district_of(row["area"])
        if not d:
            continue
        categories.add(cat)
        entry = totals.setdefault(d, {})
        entry[cat] = entry.get(cat, 0) + int(row["n"] or 0)

    ranked = sorted(totals.items(), key=lambda kv: -sum(kv[1].values()))[:limit]
    districts = [d for d, _ in ranked]
    sorted_categories = sorted(categories)
    series = [
        {"district": d, "category": cat, "count": counts.get(cat, 0)}
        for d, counts in ranked
        for cat in sorted_categories
    ]

    return Response({"filters": p, "categories": sorted_categories, "districts": districts, "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_engagement_trend(request: Request) -> Response:
    """Monthly interaction totals for the top 5 postcode districts.

    Sourced from ``PostcodeAreaInteraction`` (period-based aggregate, grouped by
    ``period_start`` month). Shaped to match ``category_trends`` — a flat
    ``{month, category, count}`` series, with the district code standing in for
    "category" — so it can be fed straight into the existing ``StackedAreaChart``
    frontend component with no changes.

    Returns: {
        "filters": {...},
        "series": [{"month": "2025-01", "category": "PL1", "count": 120}, ...]
    }
    """
    p = parse_filter_params(request)

    rows = (
        postcode_qs(p)
        .annotate(month=TruncMonth("period_start"))
        .values("month", "postcode", "area")
        .annotate(n=Sum("interaction_count"))
        .order_by()
    )

    totals: dict[str, int] = {}
    by_district_month: dict[str, dict[str, int]] = {}
    for row in rows:
        if not row["month"]:
            continue
        d = district_of(row["postcode"]) or district_of(row["area"])
        if not d:
            continue
        month = row["month"].date().isoformat() if hasattr(row["month"], "date") else row["month"].isoformat()
        n = int(row["n"] or 0)
        totals[d] = totals.get(d, 0) + n
        by_district_month.setdefault(d, {})
        by_district_month[d][month] = by_district_month[d].get(month, 0) + n

    top_districts = [d for d, _ in sorted(totals.items(), key=lambda kv: -kv[1])[:5]]

    series = [
        {"month": month, "category": d, "count": count}
        for d in top_districts
        for month, count in sorted(by_district_month.get(d, {}).items())
    ]

    return Response({"filters": p, "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def ticket_volume_trend(request: Request) -> Response:
    """Monthly ticket-purchase volume (tickets + orders), from ``PostcodeTicketPurchase``.

    Returns: {
        "filters": {...},
        "series": [{"month": "2025-01", "tickets": 340, "orders": 128}, ...]
    }
    """
    p = parse_filter_params(request)

    rows = (
        postcode_ticket_qs(p)
        .annotate(month=TruncMonth("purchase_date"))
        .values("month")
        .annotate(tickets=Sum("ticket_quantity"), orders=Count("id"))
        .order_by("month")
    )

    series = [
        {
            "month": r["month"].date().isoformat() if hasattr(r["month"], "date") else r["month"].isoformat(),
            "tickets": int(r["tickets"] or 0),
            "orders": int(r["orders"] or 0),
        }
        for r in rows
        if r["month"]
    ]

    return Response({"filters": p, "series": series})
