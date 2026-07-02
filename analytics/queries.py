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
    period      shortcut: 7d | 30d | 90d | 1y  (sets date_from if empty)
    itype       interaction_type: event | location

The helpers accept either a Django ``HttpRequest`` or a plain ``dict`` /
``QueryDict`` so they can be reused from both view layers.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import date, timedelta
from typing import Any

from django.db.models import Q

from analytics.models import PostcodeAreaInteraction, UserHashInteraction
from events.models import Event
from organisations.models import org_and_descendants_ids

PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}


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
    }
    if p["period"] and not p["dfrom"]:
        days = PERIOD_DAYS.get(p["period"])
        if days:
            p["dfrom"] = (date.today() - timedelta(days=days)).isoformat()
    return p


def events_qs(p: Mapping[str, str], base=None):
    """Apply filter params to an ``Event`` queryset."""
    qs = base if base is not None else Event.objects.all()
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
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
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
    ids = _org_ids_for(p)
    if ids:
        qs = qs.filter(organisation_id__in=ids)
    if p.get("dfrom"):
        qs = qs.filter(period_start__gte=p["dfrom"])
    if p.get("dto"):
        qs = qs.filter(period_end__lte=p["dto"])
    return qs


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
