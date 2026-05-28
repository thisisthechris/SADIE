"""
Phase 4 — Recommendations.

Two endpoints:

    GET /api/analytics/recommendations/similar/<event_id>/?limit=N
        pgvector cosine-neighbour events. Falls back to same-organisation
        most-recent events if pgvector isn't available or the source has
        no embedding yet.

    GET /api/analytics/recommendations/near/?postcode=PL4&km=5&limit=N
        upcoming events whose Location.point lies within ``km`` of the
        postcode-district centroid. Uses PostGIS ST_DWithin when GIS is
        available; otherwise falls back to a coarse haversine filter on
        the JSON ``coords`` cache.
"""

from __future__ import annotations

import math
from datetime import timedelta

from django.db.models import F
from django.db.models.expressions import RawSQL
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Event
from organisations.models import Location

from .viz_views import POSTCODE_CENTROIDS

try:
    from django.contrib.gis.geos import Point  # type: ignore
    from django.contrib.gis.measure import D  # type: ignore

    _HAS_GIS = True
except Exception:  # pragma: no cover
    _HAS_GIS = False


def _serialize(e: Event, extra: dict | None = None) -> dict:
    out = {
        "id": e.id,
        "title": e.title,
        "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
        "end_datetime": e.end_datetime.isoformat() if e.end_datetime else None,
        "organisation": {"id": e.organisation_id, "name": e.organisation.name},
        "location": (
            {"id": e.location_id, "name": e.location.name} if e.location_id else None
        ),
        "url": e.url or e.source_url or "",
    }
    if extra:
        out.update(extra)
    return out


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def similar_events(request: Request, event_id: int) -> Response:
    limit = max(1, min(int(request.query_params.get("limit", 8)), 25))
    try:
        source = Event.objects.select_related("organisation").get(pk=event_id)
    except Event.DoesNotExist:
        return Response({"detail": "not found"}, status=404)

    has_embedding = bool(getattr(source, "embedding", None) is not None)

    if has_embedding:
        # pgvector cosine: lower <=> distance ⇒ closer.
        qs = (
            Event.objects.exclude(pk=source.pk)
            .filter(embedding__isnull=False)
            .select_related("organisation", "location")
            .annotate(
                distance=RawSQL(
                    "events_event.embedding <=> %s::vector",
                    (str(list(source.embedding)),),
                )
            )
            .order_by("distance")[:limit]
        )
        results = [
            _serialize(e, {"score": float(1.0 - (e.distance or 0))}) for e in qs
        ]
    else:
        # Fallback: same organisation, most recent.
        qs = (
            Event.objects.filter(organisation=source.organisation)
            .exclude(pk=source.pk)
            .select_related("organisation", "location")
            .order_by("-start_datetime")[:limit]
        )
        results = [_serialize(e, {"score": None}) for e in qs]

    return Response(
        {
            "source": {"id": source.id, "title": source.title},
            "method": "pgvector" if has_embedding else "same_organisation",
            "results": results,
        }
    )


def _haversine_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def near_postcode(request: Request) -> Response:
    """Upcoming events within `km` of the supplied postcode-district centroid."""
    pc = (request.query_params.get("postcode") or "").strip().upper().split()[0:1]
    pc_key = pc[0] if pc else ""
    try:
        km = float(request.query_params.get("km", 5))
    except ValueError:
        km = 5.0
    km = max(0.5, min(km, 50.0))
    try:
        limit = max(1, min(int(request.query_params.get("limit", 12)), 50))
    except ValueError:
        limit = 12

    if pc_key not in POSTCODE_CENTROIDS:
        return Response(
            {
                "postcode": pc_key,
                "km": km,
                "available_districts": sorted(POSTCODE_CENTROIDS),
                "results": [],
            }
        )

    lng, lat = POSTCODE_CENTROIDS[pc_key]
    horizon = timezone.now() + timedelta(days=180)
    base = (
        Event.objects.select_related("organisation", "location")
        .filter(start_datetime__gte=timezone.now(), start_datetime__lte=horizon)
        .filter(location__isnull=False)
    )

    if _HAS_GIS:
        try:
            centre = Point(lng, lat, srid=4326)
            qs = (
                base.filter(location__point__distance_lte=(centre, D(km=km)))
                .order_by("start_datetime")[:limit]
            )
            results = [_serialize(e) for e in qs]
            return Response(
                {"postcode": pc_key, "km": km, "centre": [lng, lat], "results": results}
            )
        except Exception:
            pass

    # Fallback: load candidate locations & filter in Python via haversine.
    candidates = (
        base.values(
            "id",
            "title",
            "start_datetime",
            "end_datetime",
            "url",
            "source_url",
            "organisation_id",
            "organisation__name",
            "location_id",
            "location__name",
            "location__point",
        )
        .order_by("start_datetime")[: limit * 4]
    )
    out = []
    for row in candidates:
        coords = row.get("location__point")
        # `point` may be a CharField "lng,lat" in non-GIS mode
        if isinstance(coords, str) and "," in coords:
            try:
                clng, clat = (float(x) for x in coords.split(",", 1))
            except ValueError:
                continue
        else:
            continue
        d = _haversine_km(lng, lat, clng, clat)
        if d > km:
            continue
        out.append(
            {
                "id": row["id"],
                "title": row["title"],
                "start_datetime": row["start_datetime"].isoformat() if row["start_datetime"] else None,
                "end_datetime": row["end_datetime"].isoformat() if row["end_datetime"] else None,
                "organisation": {"id": row["organisation_id"], "name": row["organisation__name"]},
                "location": (
                    {"id": row["location_id"], "name": row["location__name"]}
                    if row["location_id"]
                    else None
                ),
                "url": row["url"] or row["source_url"] or "",
                "distance_km": round(d, 2),
            }
        )
        if len(out) >= limit:
            break
    return Response(
        {"postcode": pc_key, "km": km, "centre": [lng, lat], "results": out}
    )
