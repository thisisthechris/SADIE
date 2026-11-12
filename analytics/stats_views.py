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
    GET free-vs-paid/             -> events and attendance split by free / paid / unknown price
    GET interactions-timeseries/  -> interaction counts per week/month/quarter (``bucket``)
    GET interactions-by-type/     -> breakdown by interaction_type
    GET postcode-aggregates/      -> per-area sums for the choropleth
    GET visitors-new-returning/   -> new vs returning visitors per bucket
    GET activity-by-weekday/      -> event and interaction counts by weekday
    GET category-trends/          -> category interaction trends per bucket
    GET top-venues/               -> top locations by event count and interactions
    GET headline/                 -> events & attendees, latest week/month/quarter vs previous
    GET engagement/               -> engagement (buzz) for latest week/month/quarter vs previous
    GET peak-times/               -> event count by hour-of-day
    GET attendance-frequency/     -> distribution of events attended per visitor
    GET event-lead-time/          -> avg days between scrape and event, by org
    GET lead-time-trend/          -> avg scrape-to-event lead time per bucket
    GET peak-times-by-postcode/   -> interaction volume by daypart, per postcode district
    GET event-types-by-postcode/  -> interaction volume by event category, per postcode district
    GET postcode-engagement-trend/ -> interaction totals per bucket, top 5 postcode districts
    GET ticket-volume-trend/      -> ticket-purchase volume per bucket (tickets + orders)
    GET peak-times-tickets/       -> ticket volume by hour-of-day (via linked event's start time)
    GET weather-correlation/      -> daily interactions/tickets joined with Plymouth weather
"""

from __future__ import annotations

from datetime import date, time, timedelta

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Category
from organisations.models import Location, Organisation

from .caching import cached_response
from .models import DailyWeather, UserHashInteraction
from .queries import (
    COMPARE_PERIODS,
    bucket_start,
    comparison_periods,
    district_of,
    events_qs,
    interactions_qs,
    parse_filter_params,
    postcode_event_qs,
    postcode_qs,
    postcode_ticket_qs,
    trunc_for,
)


def _filtered(request: Request):
    p = parse_filter_params(request)
    return p, events_qs(p), interactions_qs(p), postcode_qs(p)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
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


def _price_group(is_free: bool | None) -> str:
    if is_free is None:
        return "unknown"
    return "free" if is_free else "paid"


def _pct(part: int, total: int) -> float:
    return round(100 * part / total, 1) if total else 0.0


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def free_vs_paid(request: Request) -> Response:
    """Events and attendance split by free / paid / unknown pricing.

    Attendance is the intended-attendance headcount from ticketed bookings
    (``PostcodeEventInteraction.interaction_count``). "unknown" covers events
    whose source export carried no price.
    """
    p, events, _, _ = _filtered(request)
    groups = {key: {"group": key, "events": 0, "attendance": 0} for key in ("free", "paid", "unknown")}

    for row in events.values("is_free").annotate(n=Count("id", distinct=True)).order_by():
        groups[_price_group(row["is_free"])]["events"] += row["n"]
    for row in postcode_event_qs(p).values("event__is_free").annotate(n=Sum("interaction_count")).order_by():
        groups[_price_group(row["event__is_free"])]["attendance"] += row["n"] or 0

    total_events = sum(g["events"] for g in groups.values())
    total_attendance = sum(g["attendance"] for g in groups.values())
    for g in groups.values():
        g["events_pct"] = _pct(g["events"], total_events)
        g["attendance_pct"] = _pct(g["attendance"], total_attendance)

    return Response(
        {
            "filters": p,
            "results": list(groups.values()),
            "totals": {"events": total_events, "attendance": total_attendance},
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def interactions_timeseries(request: Request) -> Response:
    """Interaction totals per week, month or quarter (``bucket``) for trend line charts."""
    p, _, interactions, _ = _filtered(request)
    # Exclude future-dated rows (synthesized/imported demo data can include them)
    # so trend charts never show incomplete/future months.
    rows = (
        interactions.filter(interaction_date__lte=date.today())
        .annotate(month=trunc_for(p["bucket"], "interaction_date"))
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
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


def _pct_change(current: float, previous: float) -> float:
    if previous > 0:
        return round(((current - previous) / previous) * 100, 1)
    return 100.0 if current > 0 else 0.0


def _comparison_context(request: Request):
    """Shared setup for period-vs-period endpoints.

    ``compare`` (week | month | quarter, default week) picks the period length.
    ``date_to`` is the report date: the latest complete period ending on or before
    it is compared with the one before. The date range itself is not applied to the
    querysets, so neither period gets clipped by it.
    """
    p = parse_filter_params(request)
    compare = request.GET.get("compare", "week")
    if compare not in COMPARE_PERIODS:
        compare = "week"
    try:
        anchor = date.fromisoformat(p["dto"]) if p["dto"] else None
    except ValueError:
        anchor = None
    undated = {**p, "dfrom": "", "dto": "", "period": ""}
    current, previous = comparison_periods(compare, anchor)
    return p, compare, current, previous, events_qs(undated), interactions_qs(undated)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def headline(request: Request) -> Response:
    """Headline stats for org insights: events & unique attendees, latest period vs the one before.

    Query params: the usual filters, plus ``compare`` (week | month | quarter,
    default week). ``date_to`` sets the report date (default: last Sunday).

    Returns:
    {
        "filters": {...},
        "compare": "week",
        "scope_label": "Plymouth Arts Centre" or "City (all)",
        "current_period": {"period_start": "2026-11-02", "period_end": "2026-11-08",
                           "events_count": 42, "attendees_count": 1234},
        "previous_period": {"period_start": "2026-10-26", "period_end": "2026-11-01", ...},
        "deltas": {"events_pct_change": 10.5, "attendees_pct_change": 12.2}
    }
    """
    p, compare, (cs, ce), (ps, pe), events, interactions = _comparison_context(request)

    scope_label = "City (all)"
    if p.get("org"):
        try:
            scope_label = Organisation.objects.get(pk=int(p["org"])).name
        except (TypeError, ValueError, Organisation.DoesNotExist):
            pass

    def _counts(start: date, end: date) -> tuple[int, int]:
        n_events = events.filter(start_datetime__date__gte=start, start_datetime__date__lte=end).count()
        n_attendees = (
            interactions.filter(interaction_date__gte=start, interaction_date__lte=end)
            .values("user_hash")
            .distinct()
            .count()
        )
        return n_events, n_attendees

    curr_events, curr_attendees = _counts(cs, ce)
    prev_events, prev_attendees = _counts(ps, pe)

    return Response(
        {
            "filters": p,
            "compare": compare,
            "scope_label": scope_label,
            "current_period": {
                "period_start": cs.isoformat(),
                "period_end": ce.isoformat(),
                "events_count": curr_events,
                "attendees_count": curr_attendees,
            },
            "previous_period": {
                "period_start": ps.isoformat(),
                "period_end": pe.isoformat(),
                "events_count": prev_events,
                "attendees_count": prev_attendees,
            },
            "deltas": {
                "events_pct_change": _pct_change(curr_events, prev_events),
                "attendees_pct_change": _pct_change(curr_attendees, prev_attendees),
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def visitors_new_returning(request: Request) -> Response:
    """New vs returning visitor counts per bucket (week, month or quarter).

    An interaction is "new" if it is the visitor's first in the filtered data;
    otherwise it counts as "returning".

    Returns: {
        "filters": {...},
        "series": [
            {"month": "2025-01-01", "new": 42, "returning": 128},  # bucket start date
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

    buckets: dict[str, dict[str, int]] = {}
    for interaction in all_interactions:
        user_hash = interaction["user_hash"]
        interaction_date = interaction["interaction_date"]
        if not interaction_date:
            continue
        key = bucket_start(interaction_date, p["bucket"]).isoformat()
        counts = buckets.setdefault(key, {"new": 0, "returning": 0})
        if first_seen[user_hash] == interaction_date:
            counts["new"] += 1
        else:
            counts["returning"] += 1

    series = [{"month": key, **counts} for key, counts in sorted(buckets.items())]

    return Response(
        {
            "filters": p,
            "series": series,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
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
@cached_response(timeout=900)
def category_trends(request: Request) -> Response:
    """Interaction counts per bucket (week, month or quarter) grouped by category.

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
        .annotate(month=trunc_for(p["bucket"], "interaction_date"))
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
                        month.date().isoformat() if hasattr(month, "date") else (month.isoformat() if month else None)
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
def engagement(request: Request) -> Response:
    """Engagement for the latest period vs the one before, plus buzz (interactions per event).

    Query params: the usual filters, plus ``compare`` (week | month | quarter,
    default week). ``date_to`` sets the report date (default: last Sunday).

    Returns: {
        "filters": {...},
        "compare": "week",
        "current": {"period_start": "2026-11-02", "period_end": "2026-11-08",
                    "events": 42, "interactions": 1234, "buzz": 29.4},
        "previous": {...same keys...},
        "deltas": {"events_pct_change": 10.5, "interactions_pct_change": 12.2, "buzz_change": 1.7}
    }
    """
    p, compare, current, previous, events, interactions = _comparison_context(request)

    def _period(start: date, end: date) -> dict:
        n_events = events.filter(start_datetime__date__gte=start, start_datetime__date__lte=end).count()
        n_interactions = interactions.filter(interaction_date__gte=start, interaction_date__lte=end).count()
        return {
            "period_start": start.isoformat(),
            "period_end": end.isoformat(),
            "events": n_events,
            "interactions": n_interactions,
            "buzz": round(n_interactions / max(1, n_events), 1),
        }

    curr = _period(*current)
    prev = _period(*previous)
    buzz_change = round(((curr["buzz"] - prev["buzz"]) / max(0.1, prev["buzz"])) * 100, 1) if prev["buzz"] > 0 else 0.0

    return Response(
        {
            "filters": p,
            "compare": compare,
            "current": curr,
            "previous": prev,
            "deltas": {
                "events_pct_change": _pct_change(curr["events"], prev["events"]),
                "interactions_pct_change": _pct_change(curr["interactions"], prev["interactions"]),
                "buzz_change": buzz_change,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
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
        events.annotate(hour=ExtractHour("start_datetime")).values("hour").annotate(count=Count("id")).order_by("hour")
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
def lead_time_trend(request: Request) -> Response:
    """Average lead time (days) between scrape and event date, per bucket.

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
        with_lead.annotate(month=trunc_for(p["bucket"], "start_datetime"))
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
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
@cached_response(timeout=900)
def postcode_engagement_trend(request: Request) -> Response:
    """Interaction totals per bucket for the top 5 postcode districts.

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
        .annotate(month=trunc_for(p["bucket"], "period_start"))
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
@cached_response(timeout=900)
def ticket_volume_trend(request: Request) -> Response:
    """Ticket-purchase volume (tickets + orders) per bucket, from ``PostcodeTicketPurchase``.

    Returns: {
        "filters": {...},
        "series": [{"month": "2025-01", "tickets": 340, "orders": 128}, ...]
    }
    """
    p = parse_filter_params(request)

    rows = (
        postcode_ticket_qs(p)
        .annotate(month=trunc_for(p["bucket"], "purchase_date"))
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


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def peak_times_tickets(request: Request) -> Response:
    """Ticket volume by hour-of-day, based on the linked event's start time.

    Mirrors ``peak-times/`` (which counts *events* by hour) but sums ticket
    quantity from ``PostcodeTicketPurchase`` instead — answers "what time of
    day do the most tickets get bought for" rather than "when do events
    start", so it's a genuinely different cut even though both are keyed by
    hour-of-day.

    Events whose ``start_datetime`` has no recorded time (stored as midnight
    00:00:00) are excluded to avoid a misleading spike at hour 0 — they are
    counted separately in ``midnight_excluded_count`` so the frontend can
    surface an explanatory note.

    Returns: {
        "filters": {...},
        "midnight_excluded_count": 12,
        "series": [{"hour": 0, "label": "00:00", "tickets": 12}, ..., {"hour": 23, ...}]
    }
    """
    p = parse_filter_params(request)
    qs = postcode_ticket_qs(p).filter(event__isnull=False, event__start_datetime__isnull=False)

    # Count events that default to midnight (likely no recorded start time).
    midnight_count = qs.filter(event__start_datetime__time=time(0, 0, 0)).aggregate(n=Sum("ticket_quantity"))["n"] or 0

    # Exclude midnight-defaulted events from the hourly breakdown.
    qs = qs.exclude(event__start_datetime__time=time(0, 0, 0))

    # Explicit .order_by("hour") — see the GROUP BY gotcha noted for
    # peak_times() above: without it, PostcodeTicketPurchase's default
    # Meta.ordering ("-purchase_date") would leak into the GROUP BY clause.
    by_hour = (
        qs.annotate(hour=ExtractHour("event__start_datetime"))
        .values("hour")
        .annotate(tickets=Sum("ticket_quantity"))
        .order_by("hour")
    )
    hour_dict = {row["hour"]: int(row["tickets"] or 0) for row in by_hour}

    series = [{"hour": h, "label": f"{h:02d}:00", "tickets": hour_dict.get(h, 0)} for h in range(24)]
    return Response({"filters": p, "midnight_excluded_count": int(midnight_count), "series": series})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
@cached_response(timeout=900)
def weather_correlation(request: Request) -> Response:
    """Daily interactions + ticket volume joined with Plymouth weather.

    Powers the Trends page's weather-vs-attendance chart. Requires
    ``DailyWeather`` rows to have been backfilled first (see the
    ``backfill_weather`` management command) — days with no matching weather
    row are still returned, with null weather fields, so the frontend can
    show a partial chart / prompt to run the backfill.

    Returns: {
        "filters": {...},
        "series": [
            {"date": "2026-01-05", "interactions": 42, "tickets": 18,
             "temp_max_c": 9.2, "precipitation_mm": 4.1, "weather_code": 61},
            ...
        ]
    }
    """
    p, _, interactions, _ = _filtered(request)

    interactions_rows = interactions.values("interaction_date").annotate(n=Count("id")).order_by("interaction_date")
    interactions_by_day = {r["interaction_date"]: r["n"] for r in interactions_rows}

    tickets_rows = (
        postcode_ticket_qs(p).values("purchase_date").annotate(n=Sum("ticket_quantity")).order_by("purchase_date")
    )
    tickets_by_day = {r["purchase_date"]: r["n"] for r in tickets_rows}

    all_days = sorted(set(interactions_by_day) | set(tickets_by_day))
    if not all_days:
        return Response({"filters": p, "series": []})

    weather_by_day = {w.date: w for w in DailyWeather.objects.filter(date__gte=all_days[0], date__lte=all_days[-1])}

    series = []
    for d in all_days:
        w = weather_by_day.get(d)
        series.append(
            {
                "date": d.isoformat(),
                "interactions": int(interactions_by_day.get(d, 0)),
                "tickets": int(tickets_by_day.get(d, 0) or 0),
                "temp_max_c": w.temp_max_c if w else None,
                "precipitation_mm": w.precipitation_mm if w else None,
                "wind_speed_ms": w.wind_speed_ms if w else None,
                "sunshine_hours": w.sunshine_hours if w else None,
                "weather_code": w.weather_code if w else None,
            }
        )

    return Response({"filters": p, "series": series})
