"""
Shared queryset helpers for filtered analytics views.

This is the single source of truth for the dashboard's `_filter_params /
_events_qs / _interactions_qs / _postcode_qs` semantics. Both the
server-rendered Django templates in `dashboard/views.py` and the new
DRF stats endpoints in `analytics/stats_views.py` consume these helpers,
so any change to filter semantics is made in exactly one place.

Filter parameter schema (matches the existing dashboard query string):

    org         organisation id
    category    category id
    date_from   ISO date (YYYY-MM-DD)
    date_to     ISO date (YYYY-MM-DD)
    search      free-text (icontains over title/description; FTS later)
    period      shortcut, sets date_from (and date_to for week periods) if empty:
                  1w | 4w | 12w | 52w  complete Mon-Sun weeks ending last Sunday
                  7d | 30d | 90d | 1y  days back from today (legacy)
    bucket      trend grouping: week | month | quarter (default month)
    itype       interaction_type: event | location

The helpers accept either a Django ``HttpRequest`` or a plain ``dict`` /
``QueryDict`` so they can be reused from both view layers.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from django.db.models import Q
from django.db.models.functions import TruncMonth, TruncQuarter, TruncWeek
from django.utils import timezone

from analytics.models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)
from events.models import Event
from organisations.models import org_and_descendants_ids

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}
PERIOD_WEEKS = {"1w": 1, "4w": 4, "12w": 12, "52w": 52}
BUCKETS = {"week": TruncWeek, "month": TruncMonth, "quarter": TruncQuarter}


def last_complete_week(today: date | None = None) -> tuple[date, date]:
    """(Monday, Sunday) of the most recent week that has fully finished.

    Weeks run Monday to Sunday, so on a Monday the report rolls forward to the
    week that ended the day before. On a Sunday the current week isn't over yet.
    """
    today = today or timezone.localdate()
    end = today - timedelta(days=today.isoweekday() % 7 or 7)
    return end - timedelta(days=6), end


def week_period_bounds(weeks: int, today: date | None = None) -> tuple[date, date]:
    """(start, end) covering the last ``weeks`` complete Mon-Sun weeks."""
    start, end = last_complete_week(today)
    return start - timedelta(weeks=weeks - 1), end


COMPARE_PERIODS = ("week", "month", "quarter")


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _quarter_start(d: date) -> date:
    return d.replace(month=((d.month - 1) // 3) * 3 + 1, day=1)


def comparison_periods(compare: str, anchor: date | None = None) -> tuple[tuple[date, date], tuple[date, date]]:
    """Latest complete week/month/quarter ending on or before ``anchor``, and the one before it.

    ``anchor`` is the report date (defaults to the end of the last complete week).
    A period only counts as complete if its last day is on or before the anchor,
    so a mid-month anchor reports the previous full month.
    """
    anchor = anchor or last_complete_week()[1]
    if compare == "week":
        start, end = last_complete_week(anchor + timedelta(days=1))
        return (start, end), (start - timedelta(weeks=1), start - timedelta(days=1))

    period_start = _quarter_start if compare == "quarter" else _month_start
    # Day after the anchor: if that starts a new period, the anchor's period is complete.
    next_start = period_start(anchor + timedelta(days=1))
    end = next_start - timedelta(days=1)
    start = period_start(end)
    prev_end = start - timedelta(days=1)
    return (start, end), (period_start(prev_end), prev_end)


def bucket_start(d: date, bucket: str) -> date:
    """Python counterpart of :func:`trunc_for` for a single date."""
    if bucket == "week":
        return d - timedelta(days=d.weekday())
    if bucket == "quarter":
        return _quarter_start(d)
    return _month_start(d)


def trunc_for(bucket: str, field: str):
    """Truncation expression for a trend bucket; unknown values fall back to month."""
    return BUCKETS.get(bucket, TruncMonth)(field)


def _org_ids_for(p: Mapping[str, str]) -> list[int]:
    """Return list of org ids implied by filter ``org`` (parent rolls up to children)."""
    raw = p.get("org")
    if not raw:
        return []
    try:
        org_id = int(raw)
    except (TypeError, ValueError):
        return []
    return org_and_descendants_ids(org_id)


def parse_filter_params(source: Any) -> dict:
    """Normalise filter params from a request, dict, or QueryDict.

    Returns a dict with stable keys: ``org, cat, dfrom, dto, search, period, itype``.
    Empty strings are preserved (rather than ``None``) to match the existing
    template-context expectations.
    """
    if hasattr(source, "GET"):
        getter = source.GET.get
    elif hasattr(source, "get"):
        getter = source.get
    else:  # pragma: no cover - defensive
        raise TypeError("source must be an HttpRequest, dict, or QueryDict")

    p = {
        "org": getter("org", "") or "",
        "cat": getter("category", "") or "",
        "dfrom": getter("date_from", "") or getter("dfrom", "") or "",
        "dto": getter("date_to", "") or getter("dto", "") or "",
        "search": getter("search", "") or "",
        "period": getter("period", "") or "",
        "itype": getter("itype", "") or "",
        "bucket": getter("bucket", "") or "",
    }
    if p["bucket"] not in BUCKETS:
        p["bucket"] = "month"
    if p["period"] and not p["dfrom"]:
        if p["period"] in PERIOD_WEEKS:
            start, end = week_period_bounds(PERIOD_WEEKS[p["period"]])
            p["dfrom"] = start.isoformat()
            p["dto"] = p["dto"] or end.isoformat()
        elif p["period"] in PERIOD_DAYS:
            p["dfrom"] = (date.today() - timedelta(days=PERIOD_DAYS[p["period"]])).isoformat()
    return p


def events_qs(p: Mapping[str, str], base=None):
    """Apply filter params to an ``Event`` queryset."""
    qs = base if base is not None else Event.objects.all()
    # Optimize JOINs for common filters
    qs = qs.select_related("organisation", "location").prefetch_related("categories")
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("cat"):
        qs = qs.filter(categories__id=p["cat"])
    if p.get("dfrom"):
        qs = qs.filter(start_datetime__date__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(start_datetime__date__lte=p["dto"])
    if p.get("search"):
        qs = qs.filter(Q(title__icontains=p["search"]) | Q(description__icontains=p["search"]))
    return qs.distinct()


def interactions_qs(p: Mapping[str, str], base=None):
    """Apply filter params to a ``UserHashInteraction`` queryset."""
    qs = base if base is not None else UserHashInteraction.objects.all()
    # Optimize JOINs: fetch related Event (for category filtering) and Organisation
    qs = qs.select_related("event", "organisation", "location")
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("cat"):
        qs = qs.filter(event__categories__id=p["cat"]).distinct()
    if p.get("dfrom"):
        qs = qs.filter(interaction_date__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(interaction_date__lte=p["dto"])
    if p.get("itype"):
        qs = qs.filter(interaction_type=p["itype"])
    return qs


def postcode_qs(p: Mapping[str, str], base=None):
    """Apply filter params to a ``PostcodeAreaInteraction`` queryset."""
    qs = base if base is not None else PostcodeAreaInteraction.objects.all()
    # Optimize JOIN for Organisation filtering
    qs = qs.select_related("organisation")
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("dfrom"):
        qs = qs.filter(period_start__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(period_end__lte=p["dto"])
    return qs


def postcode_event_qs(p: Mapping[str, str], base=None):
    """Apply filter params to a ``PostcodeEventInteraction`` queryset.

    Postcode-cohort event interactions are ordered by ``interaction_date`` (the
    event-date basis), so filters mirror ``interactions_qs`` rather than the
    period-based ``postcode_qs``.
    """
    qs = base if base is not None else PostcodeEventInteraction.objects.all()
    # Optimize JOINs: fetch related Event (for category filtering), Organisation, and Location
    qs = qs.select_related("event", "organisation", "location").prefetch_related("event__categories")
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("cat"):
        qs = qs.filter(event__categories__id=p["cat"])
    if p.get("dfrom"):
        qs = qs.filter(interaction_date__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(interaction_date__lte=p["dto"])
    return qs.distinct()


def postcode_ticket_qs(p: Mapping[str, str], base=None):
    """Apply filter params to a ``PostcodeTicketPurchase`` queryset.

    Ticket purchases are filtered by ``purchase_date`` (the transaction date),
    mirroring ``postcode_event_qs`` but against the actual purchase timestamp
    rather than the event date.
    """
    qs = base if base is not None else PostcodeTicketPurchase.objects.all()
    # Optimize JOINs: fetch related Event (for category filtering), Organisation, and Location
    qs = qs.select_related("event", "organisation", "location").prefetch_related("event__categories")
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("cat"):
        qs = qs.filter(event__categories__id=p["cat"])
    if p.get("dfrom"):
        qs = qs.filter(purchase_date__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(purchase_date__lte=p["dto"])
    return qs.distinct()


def district_of(postcode: str) -> str:
    """Extract the postcode district (e.g. 'PL4 0AB' -> 'PL4').

    Shared by viz_views.py (postcode_districts, postcode_ticket_districts, etc.)
    and stats_views.py (peak_times_by_postcode, event_types_by_postcode,
    postcode_engagement_trend) so district-grouping logic lives in one place.
    """
    if not postcode:
        return ""
    return postcode.strip().split()[0].upper() if " " in postcode else postcode.strip().upper()


def location_coords(loc) -> list[float] | None:
    """Return ``[lng, lat]`` for a Location, or None.

    Works with both PostGIS PointField and the CharField fallback used when
    GDAL is unavailable (see ``organisations.models._point_field``).
    """
    if not loc or not getattr(loc, "point", None):
        return None
    pt = loc.point
    try:
        return [pt.x, pt.y]
    except AttributeError:
        try:
            lng, lat = str(pt).split(",")
            return [float(lng), float(lat)]
        except (ValueError, TypeError):
            return None
