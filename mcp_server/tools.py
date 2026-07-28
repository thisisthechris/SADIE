"""
Pure tool implementations for the MCP server.

Each function accepts parameters matching the tool signature and returns plain dicts
suitable for JSON serialization. No MCP decorators here — those live in server.py.

Reuses Django ORM, query helpers from analytics/queries.py, and hybrid search from
sadie/search_views.py to ensure consistency with existing endpoints.
"""

import logging
from datetime import date

from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from analytics.models import UserHashInteraction
from analytics.queries import (
    events_qs,
    interactions_qs,
    parse_filter_params,
    postcode_qs,
)
from events.models import Category, Event
from organisations.models import Location, Organisation
from sadie.search_views import _embed_query, _search_events, _search_organisations

logger = logging.getLogger(__name__)


# ============================================================================
# SEARCH
# ============================================================================


def search_sadie(query: str, types: str = "event,organisation", limit: int = 20) -> dict:
    """
    Hybrid FTS + trigram + vector search across events and organisations.

    Args:
        query: Search string (minimum 2 chars).
        types: Comma-separated list: "event", "organisation" (default: both).
        limit: Max results (capped at 50).

    Returns:
        {"query": str, "vector_available": bool, "results": [
          {"type": "event"|"organisation", "id": int, "title": str,
           "snippet": str, "score": float, "url": str, ...}
        ]}
    """
    q = (query or "").strip()
    if not q or len(q) < 2:
        return {"query": q, "vector_available": False, "results": []}

    try:
        limit = max(1, min(int(limit), 50))
    except (ValueError, TypeError):
        limit = 20

    type_set = {t.strip() for t in (types or "event,organisation").split(",") if t.strip()}

    vec = _embed_query(q)
    results: list[dict] = []

    try:
        if "event" in type_set:
            results.extend(_search_events(q, vec, limit))
        if "organisation" in type_set:
            results.extend(_search_organisations(q, vec, limit))
    except Exception as exc:
        logger.exception("Search error: %s", exc)
        return {
            "query": q,
            "vector_available": False,
            "results": [],
            "error": str(exc),
        }

    results.sort(key=lambda r: r["score"], reverse=True)
    return {
        "query": q,
        "vector_available": vec is not None,
        "results": results[:limit],
    }


# ============================================================================
# BROWSE: EVENTS
# ============================================================================


def list_events(
    org_id: int | None = None,
    category_id: int | None = None,
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    limit: int = 50,
    offset: int = 0,
) -> dict:
    """
    List events with optional filtering.

    Args:
        org_id: Filter by organisation (includes children).
        category_id: Filter by category ID.
        date_from: ISO date (YYYY-MM-DD).
        date_to: ISO date (YYYY-MM-DD).
        search: Free-text search on title/description.
        period: Shortcut (7d, 30d, 90d, 1y).
        limit: Results per page (max 200).
        offset: Pagination offset.

    Returns:
        {"count": int, "results": [event_dict, ...]}
    """
    try:
        limit = max(1, min(int(limit), 200))
        offset = max(0, int(offset))
    except (ValueError, TypeError):
        limit = 50
        offset = 0

    params = {
        "org": str(org_id) if org_id else "",
        "category": str(category_id) if category_id else "",
        "date_from": date_from,
        "date_to": date_to,
        "search": search,
        "period": period,
    }

    try:
        qs = events_qs(params).select_related("organisation", "location")
        total = qs.count()
        events = qs[offset : offset + limit]

        results = []
        for e in events:
            results.append(
                {
                    "id": e.id,
                    "title": e.title,
                    "description": e.description[:500] if e.description else "",
                    "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
                    "end_datetime": e.end_datetime.isoformat() if e.end_datetime else None,
                    "organisation_id": e.organisation_id,
                    "organisation_name": e.organisation.name,
                    "location_id": e.location_id,
                    "location_name": e.location.name if e.location else None,
                    "url": e.url,
                    "image_url": e.image_url,
                }
            )

        return {
            "count": total,
            "limit": limit,
            "offset": offset,
            "results": results,
        }
    except Exception as exc:
        logger.exception("list_events error: %s", exc)
        return {"count": 0, "results": [], "error": str(exc)}


def get_event(event_id: int) -> dict:
    """
    Get full event detail including interaction stats.

    Returns:
        {"id": int, "title": str, ..., "total_interactions": int,
         "unique_visitors": int, ...}
    """
    try:
        e = Event.objects.select_related("organisation", "location").get(pk=event_id)
        cats = list(e.categories.values_list("name", flat=True))
        interactions = UserHashInteraction.objects.filter(event_id=event_id)
        unique_visitors = interactions.values("user_hash").distinct().count()
        total_interactions = interactions.count()

        return {
            "id": e.id,
            "title": e.title,
            "description": e.description,
            "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
            "end_datetime": e.end_datetime.isoformat() if e.end_datetime else None,
            "organisation_id": e.organisation_id,
            "organisation_name": e.organisation.name,
            "location_id": e.location_id,
            "location_name": e.location.name if e.location else None,
            "url": e.url,
            "image_url": e.image_url,
            "categories": cats,
            "total_interactions": total_interactions,
            "unique_visitors": unique_visitors,
        }
    except Event.DoesNotExist:
        return {"error": f"Event {event_id} not found"}
    except Exception as exc:
        logger.exception("get_event error: %s", exc)
        return {"error": str(exc)}


# ============================================================================
# BROWSE: ORGANISATIONS & CATEGORIES
# ============================================================================


def list_organisations(
    search: str = "",
    is_partner: bool | None = None,
    limit: int = 50,
) -> dict:
    """
    List organisations with optional filtering.

    Args:
        search: Free-text search on name/description.
        is_partner: Filter by partner status (True/False/None=all).
        limit: Results (max 200).

    Returns:
        {"count": int, "results": [{"id": int, "name": str, "slug": str,
          "is_partner": bool, "event_count": int, ...}, ...]}
    """
    try:
        limit = max(1, min(int(limit), 200))
    except (ValueError, TypeError):
        limit = 50

    qs = Organisation.objects.all()

    if is_partner is not None:
        qs = qs.filter(is_partner=is_partner)

    if search:
        qs = qs.filter(name__icontains=search)

    qs = qs.annotate(n_events=Count("events"))[:limit]

    results = []
    for org in qs:
        results.append(
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "is_partner": org.is_partner,
                "website": org.website,
                "description": org.description[:300] if org.description else "",
                "event_count": org.n_events,
            }
        )

    return {
        "count": len(results),
        "results": results,
    }


def get_organisation(identifier: str | int) -> dict:
    """
    Get organisation detail (by slug or ID) including locations, events, stats.

    Returns:
        {"id": int, "name": str, "slug": str, "is_partner": bool,
         "event_count": int, "location_count": int, "total_interactions": int, ...}
    """
    try:
        if isinstance(identifier, int):
            org = Organisation.objects.get(pk=identifier)
        else:
            org = Organisation.objects.get(slug=str(identifier))

        event_count = org.events.count()
        location_count = org.locations.count()
        total_interactions = org.interactions.count()

        locations = [{"id": loc.id, "name": loc.name, "address": loc.address} for loc in org.locations.all()[:20]]

        children_ids = list(org.children.values_list("id", "name", "slug"))
        children = [{"id": cid, "name": cname, "slug": cslug} for cid, cname, cslug in children_ids]

        return {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "is_partner": org.is_partner,
            "website": org.website,
            "description": org.description,
            "event_count": event_count,
            "location_count": location_count,
            "total_interactions": total_interactions,
            "locations": locations,
            "children": children,
        }
    except Organisation.DoesNotExist:
        return {"error": f"Organisation {identifier} not found"}
    except Exception as exc:
        logger.exception("get_organisation error: %s", exc)
        return {"error": str(exc)}


def list_categories() -> dict:
    """
    List all categories with event counts.

    Returns:
        {"results": [{"id": int, "name": str, "slug": str, "event_count": int}, ...]}
    """
    try:
        cats = Category.objects.annotate(n_events=Count("events")).order_by("-n_events")
        results = [{"id": c.id, "name": c.name, "slug": c.slug, "event_count": c.n_events} for c in cats]
        return {"results": results}
    except Exception as exc:
        logger.exception("list_categories error: %s", exc)
        return {"results": [], "error": str(exc)}


# ============================================================================
# ANALYTICS: STATS & AGGREGATIONS
# ============================================================================


def get_stats_summary(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
) -> dict:
    """
    Top-line counts: organisations, locations, events, interactions, unique visitors, postcodes.
    Plus upcoming events list.

    Returns:
        {"filters": {...}, "org_count": int, "location_count": int,
         "event_count": int, "interaction_count": int, "unique_visitors": int,
         "postcode_count": int, "upcoming_events": [...]}
    """
    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        events = events_qs(params)
        interactions = interactions_qs(params)
        postcodes = postcode_qs(params)

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

        upcoming_list = [
            {
                "id": u["id"],
                "title": u["title"],
                "start_datetime": u["start_datetime"].isoformat() if u["start_datetime"] else None,
                "url": u["url"],
                "image_url": u["image_url"],
                "organisation": {"id": u["organisation_id"], "name": u["organisation__name"]},
                "location": {
                    "id": u["location_id"],
                    "name": u["location__name"],
                }
                if u["location_id"]
                else None,
            }
            for u in upcoming
        ]

        return {
            "filters": params,
            "org_count": Organisation.objects.count(),
            "location_count": Location.objects.count(),
            "event_count": events.count(),
            "interaction_count": interactions.count(),
            "unique_visitors": interactions.values("user_hash").distinct().count(),
            "postcode_count": postcodes.aggregate(t=Sum("interaction_count"))["t"] or 0,
            "upcoming_events": upcoming_list,
        }
    except Exception as exc:
        logger.exception("get_stats_summary error: %s", exc)
        return {"error": str(exc)}


def top_organisations(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
    limit: int = 10,
) -> dict:
    """
    Top organisations by filtered event count.

    Returns:
        {"filters": {...}, "results": [{"id": int, "name": str, "slug": str,
          "event_count": int}, ...]}
    """
    try:
        limit = max(1, min(int(limit), 100))
    except (ValueError, TypeError):
        limit = 10

    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        events = events_qs(params)
        rows = list(
            events.values("organisation_id", "organisation__name", "organisation__slug")
            .annotate(n=Count("id"))
            .order_by("-n")[:limit]
        )

        results = [
            {
                "id": r["organisation_id"],
                "name": r["organisation__name"],
                "slug": r["organisation__slug"],
                "event_count": r["n"],
            }
            for r in rows
        ]

        return {"filters": params, "results": results}
    except Exception as exc:
        logger.exception("top_organisations error: %s", exc)
        return {"error": str(exc)}


def top_categories(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
    limit: int = 12,
) -> dict:
    """
    Top categories by filtered event count.

    Returns:
        {"filters": {...}, "results": [{"id": int, "name": str, "slug": str,
          "event_count": int}, ...]}
    """
    try:
        limit = max(1, min(int(limit), 100))
    except (ValueError, TypeError):
        limit = 12

    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        events = events_qs(params)
        rows = list(
            Category.objects.filter(events__in=events)
            .values("id", "name", "slug")
            .annotate(n=Count("events"))
            .order_by("-n")[:limit]
        )

        results = [
            {
                "id": r["id"],
                "name": r["name"],
                "slug": r["slug"],
                "event_count": r["n"],
            }
            for r in rows
        ]

        return {"filters": params, "results": results}
    except Exception as exc:
        logger.exception("top_categories error: %s", exc)
        return {"error": str(exc)}


def interactions_timeseries(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
) -> dict:
    """
    Monthly interaction totals (time series).

    Returns:
        {"filters": {...}, "series": [{"month": "YYYY-MM", "count": int}, ...]}
    """
    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        interactions = interactions_qs(params)
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

        return {"filters": params, "series": series}
    except Exception as exc:
        logger.exception("interactions_timeseries error: %s", exc)
        return {"error": str(exc)}


def interactions_by_type(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
) -> dict:
    """
    Breakdown of interactions by type (event, location).

    Returns:
        {"filters": {...}, "results": [{"interaction_type": str, "count": int}, ...]}
    """
    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        interactions = interactions_qs(params)
        rows = list(interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n"))

        results = [{"interaction_type": r["interaction_type"], "count": r["n"]} for r in rows]

        return {"filters": params, "results": results}
    except Exception as exc:
        logger.exception("interactions_by_type error: %s", exc)
        return {"error": str(exc)}


def postcode_aggregates(
    org_id: str = "",
    category_id: str = "",
    date_from: str = "",
    date_to: str = "",
    search: str = "",
    period: str = "",
    itype: str = "",
) -> dict:
    """
    Postcode-area aggregates: per-area sums and per-postcode breakdowns.

    Returns:
        {"filters": {...}, "by_area": [...], "by_postcode": [...]}
    """
    try:
        params = {
            "org": org_id,
            "category": category_id,
            "date_from": date_from,
            "date_to": date_to,
            "search": search,
            "period": period,
            "itype": itype,
        }
        params = parse_filter_params(params)

        postcodes = postcode_qs(params)

        by_area = list(postcodes.values("area").annotate(total=Sum("interaction_count")).order_by("-total")[:100])
        by_postcode = list(
            postcodes.values("postcode", "area").annotate(total=Sum("interaction_count")).order_by("-total")[:200]
        )

        return {
            "filters": params,
            "by_area": by_area,
            "by_postcode": by_postcode,
        }
    except Exception as exc:
        logger.exception("postcode_aggregates error: %s", exc)
        return {"error": str(exc)}


def get_event_stats(event_id: int) -> dict:
    """
    Per-event interaction analytics: unique visitors, total count, monthly series.

    Returns:
        {"event_id": int, "unique_users": int, "total_interactions": int,
         "by_month": [{"month": str, "count": int}, ...]}
    """
    try:
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

        return {
            "event_id": event_id,
            "unique_users": unique_users,
            "total_interactions": total,
            "by_month": series,
        }
    except Exception as exc:
        logger.exception("get_event_stats error: %s", exc)
        return {"error": str(exc)}
