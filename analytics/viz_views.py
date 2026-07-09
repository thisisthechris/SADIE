"""
Phase 3 — 3D-visualisation data endpoints.

These views return compact, deck.gl/three.js-friendly payloads. They
share the standard analytics filter schema (see
``analytics.queries.parse_filter_params``) so each viz respects the
global FilterBar in the SPA.

Endpoints (mounted at /api/analytics/viz/):

    GET event-points/        flat array of [lng, lat, count] per venue
    GET postcode-bars/       postcode centroids with totals (3D columns)
    GET postcode-points/     exact geocoded full postcodes (pins)
    GET postcode-heat/       clustered privacy-grouped postcodes (heatmap)
    GET network/             org ↔ category ↔ user-cluster graph
    GET spatiotemporal/      flat events array for the time-space cube
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

from django.db.models import Count, Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.request import Request
from rest_framework.response import Response

from events.models import Category
from organisations.models import Location, Organisation

from .geocoding import cluster_points
from .models import PostcodeGeo
from .queries import (
    events_qs,
    interactions_qs,
    location_coords,
    parse_filter_params,
    postcode_qs,
)

# Centroids for PL postcode districts (lng, lat).
# Derived from bbox midpoints of the pl-postcode-districts.geojson boundaries.
POSTCODE_CENTROIDS = {
    "PL1":  [-4.1606, 50.3636],
    "PL2":  [-4.1659, 50.3901],
    "PL3":  [-4.1249, 50.3888],
    "PL4":  [-4.1241, 50.3731],
    "PL5":  [-4.1658, 50.4210],
    "PL6":  [-4.1075, 50.4304],
    "PL7":  [-4.0302, 50.4219],
    "PL8":  [-4.0134, 50.3252],
    "PL9":  [-4.0974, 50.3351],
    "PL10": [-4.2167, 50.3289],
    "PL11": [-4.2986, 50.3693],
    "PL12": [-4.2935, 50.4384],
    "PL13": [-4.4896, 50.3613],
    "PL14": [-4.4921, 50.4596],
    "PL15": [-4.4371, 50.6341],
    "PL16": [-4.2528, 50.6664],
    "PL17": [-4.3241, 50.5205],
    "PL18": [-4.2267, 50.5173],
    "PL19": [-4.1424, 50.5772],
    "PL20": [-4.0251, 50.5345],
    "PL21": [-3.9032, 50.4042],
    "PL22": [-4.6414, 50.4042],
    "PL23": [-4.6228, 50.3365],
    "PL24": [-4.7080, 50.3429],
    "PL25": [-4.7725, 50.3378],
    "PL26": [-4.8241, 50.3209],
    "PL27": [-4.9202, 50.5429],
    "PL28": [-4.9947, 50.5478],
    "PL29": [-4.8405, 50.5901],
    "PL30": [-4.7483, 50.4949],
    "PL31": [-4.7217, 50.4735],
    "PL32": [-4.6366, 50.6481],
    "PL33": [-4.7538, 50.6193],
    "PL34": [-4.7447, 50.6665],
    "PL35": [-4.6813, 50.6932],
}


def _district(postcode: str) -> str:
    """Extract the postcode district (e.g. 'PL4 0AB' → 'PL4')."""
    if not postcode:
        return ""
    return postcode.strip().split()[0].upper() if " " in postcode else postcode.strip().upper()


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_points(request: Request) -> Response:
    """One row per venue with coords + filtered event count.

    Powers the HexagonLayer on /app/map3d/. Output is intentionally flat:
    each row is ``{lng, lat, event_count, location_id, name, organisation}``
    so deck.gl can aggregate client-side.
    """
    p = parse_filter_params(request)
    events = events_qs(p).select_related("location", "organisation").filter(location__isnull=False)
    counts: dict[int, int] = {}
    for row in events.order_by().values("location_id").annotate(n=Count("id", distinct=True)):
        counts[row["location_id"]] = row["n"]

    locs = Location.objects.select_related("organisation").filter(id__in=counts.keys())
    rows = []
    for loc in locs:
        coords = location_coords(loc)
        if not coords:
            continue
        rows.append(
            {
                "location_id": loc.id,
                "name": loc.name,
                "organisation_id": loc.organisation_id,
                "organisation": loc.organisation.name,
                "lng": coords[0],
                "lat": coords[1],
                "event_count": counts.get(loc.id, 0),
            }
        )
    return Response({"filters": p, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_bars(request: Request) -> Response:
    """Postcode-area totals with centroid coords for ColumnLayer extrusion."""
    p = parse_filter_params(request)
    rows = list(
        postcode_qs(p)
        .order_by()
        .values("postcode", "area")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")
    )
    out = []
    for r in rows:
        district = _district(r["postcode"]) or _district(r["area"])
        coords = POSTCODE_CENTROIDS.get(district)
        if not coords:
            continue
        out.append(
            {
                "postcode": r["postcode"],
                "district": district,
                "area": r["area"],
                "lng": coords[0],
                "lat": coords[1],
                "total": int(r["total"] or 0),
            }
        )
    return Response({"filters": p, "results": out})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def network(request: Request) -> Response:
    """Tripartite org ↔ category ↔ user-cluster graph for 3d-force-graph.

    Users are bucketed (MD5(user_hash) mod ``buckets``) to avoid exposing
    per-user activity and to keep the node count bounded.
    """
    p = parse_filter_params(request)
    buckets = max(4, min(int(request.GET.get("buckets", "16")), 64))

    interactions = interactions_qs(p)

    # Org → category edges (via filtered events).
    cat_edges = list(
        events_qs(p)
        .filter(categories__isnull=False)
        .order_by()
        .values("organisation_id", "categories__id")
        .annotate(n=Count("id", distinct=True))
    )
    # Org → user-cluster edges.
    user_rows = list(interactions.order_by().values("organisation_id", "user_hash").annotate(n=Count("id")))

    org_ids = {row["organisation_id"] for row in cat_edges} | {row["organisation_id"] for row in user_rows}
    cat_ids = {row["categories__id"] for row in cat_edges if row["categories__id"]}

    org_lookup = {o.id: o.name for o in Organisation.objects.filter(id__in=org_ids)}
    cat_lookup = {c.id: c.name for c in Category.objects.filter(id__in=cat_ids)}

    nodes = []
    for oid, name in org_lookup.items():
        nodes.append({"id": f"o{oid}", "type": "organisation", "label": name})
    for cid, name in cat_lookup.items():
        nodes.append({"id": f"c{cid}", "type": "category", "label": name})

    # Bucket users.
    bucket_weight: dict[int, int] = {}
    bucket_org_links: dict[tuple[int, int], int] = {}
    for row in user_rows:
        h = hashlib.md5(row["user_hash"].encode("utf-8")).hexdigest()
        b = int(h[:8], 16) % buckets
        bucket_weight[b] = bucket_weight.get(b, 0) + row["n"]
        key = (row["organisation_id"], b)
        bucket_org_links[key] = bucket_org_links.get(key, 0) + row["n"]
    for b, w in bucket_weight.items():
        nodes.append({"id": f"u{b}", "type": "user_cluster", "label": f"Cluster {b}", "weight": w})

    links = []
    for row in cat_edges:
        if not row["categories__id"]:
            continue
        links.append(
            {
                "source": f"o{row['organisation_id']}",
                "target": f"c{row['categories__id']}",
                "type": "org_category",
                "value": row["n"],
            }
        )
    for (oid, b), w in bucket_org_links.items():
        links.append(
            {
                "source": f"o{oid}",
                "target": f"u{b}",
                "type": "org_user",
                "value": w,
            }
        )

    return Response(
        {
            "filters": p,
            "buckets": buckets,
            "node_count": len(nodes),
            "link_count": len(links),
            "nodes": nodes,
            "links": links,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def spatiotemporal(request: Request) -> Response:
    """Flat ``[lng, lat, t_days, cat_id, event_id]`` array for the time cube.

    ``t_days`` is days since the earliest event in the result set; the
    SPA uses it as the Y axis. Limited to 5 000 rows to bound payload.
    """
    p = parse_filter_params(request)
    if not p.get("dfrom"):
        p["dfrom"] = (date.today() - timedelta(days=180)).isoformat()
    if not p.get("dto"):
        p["dto"] = (date.today() + timedelta(days=180)).isoformat()

    events = (
        events_qs(p)
        .select_related("location")
        .prefetch_related("categories")
        .filter(location__isnull=False)
        .order_by("start_datetime")[:5000]
    )

    rows = []
    earliest = None
    cat_lookup: dict[int, str] = {}
    for ev in events:
        coords = location_coords(ev.location) if ev.location_id else None
        if not coords:
            continue
        if earliest is None or ev.start_datetime < earliest:
            earliest = ev.start_datetime
        cats = list(ev.categories.all())
        primary = cats[0] if cats else None
        cat_id = primary.id if primary else 0
        if primary and primary.id not in cat_lookup:
            cat_lookup[primary.id] = primary.name
        rows.append(
            {
                "id": ev.id,
                "lng": coords[0],
                "lat": coords[1],
                "ts": ev.start_datetime.isoformat(),
                "cat": cat_id,
                "title": ev.title,
            }
        )

    if earliest:
        for r in rows:
            # Re-parse just to compute day offset; cheap because n ≤ 5k.
            from django.utils.dateparse import parse_datetime

            dt = parse_datetime(r["ts"])
            r["t"] = (dt - earliest).days if dt else 0
    else:
        for r in rows:
            r["t"] = 0

    return Response(
        {
            "filters": p,
            "earliest": earliest.isoformat() if earliest else None,
            "categories": [{"id": cid, "name": name} for cid, name in cat_lookup.items()],
            "count": len(rows),
            "results": rows,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def event_list(request: Request) -> Response:
    """Flat per-event list with venue coords for the 2D events map.

    Honours the standard FilterBar params and an optional ``limit``
    (default 500, max 2000). Powers the "Events" mode on /app/map/,
    which adds a client-side time slider on top of the returned set.
    """
    p = parse_filter_params(request)
    try:
        limit = max(1, min(int(request.GET.get("limit", "500")), 2000))
    except (TypeError, ValueError):
        limit = 500

    events = (
        events_qs(p)
        .select_related("organisation", "location")
        .filter(location__isnull=False)
        .order_by("start_datetime")[:limit]
    )

    rows = []
    for ev in events:
        coords = location_coords(ev.location) if ev.location_id else None
        if not coords:
            continue
        rows.append(
            {
                "id": ev.id,
                "title": ev.title,
                "lng": coords[0],
                "lat": coords[1],
                "start": ev.start_datetime.isoformat() if ev.start_datetime else None,
                "end": ev.end_datetime.isoformat() if ev.end_datetime else None,
                "url": ev.url or "",
                "organisation": ev.organisation.name if ev.organisation_id else "",
                "organisation_id": ev.organisation_id,
                "location_name": ev.location.name if ev.location_id else "",
                "location_id": ev.location_id,
            }
        )
    return Response({"filters": p, "count": len(rows), "limit": limit, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_records(request: Request) -> Response:
    """Top-N raw PostcodeAreaInteraction rows under the current filters.

    Powers the "Postcode records" table on /app/postcodes/. Honours the
    standard FilterBar params and an optional ``limit`` (default 200,
    max 1000), ordered by ``-interaction_count``.
    """
    p = parse_filter_params(request)
    try:
        limit = max(1, min(int(request.GET.get("limit", "200")), 1000))
    except (TypeError, ValueError):
        limit = 200

    qs = postcode_qs(p).select_related("organisation").order_by("-interaction_count")[:limit]
    rows = [
        {
            "id": r.id,
            "postcode": r.postcode,
            "area": r.area or "",
            "organisation": r.organisation.name if r.organisation_id else "",
            "organisation_id": r.organisation_id,
            "interaction_count": r.interaction_count,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
        }
        for r in qs
    ]
    return Response({"filters": p, "count": len(rows), "limit": limit, "results": rows})


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_points(request: Request) -> Response:
    """Exact geocoded full postcodes for pin visualization.

    Returns one row per distinct postcode with coordinates from PostcodeGeo
    and aggregated interaction counts. Respects standard FilterBar filters.

    Output: {lng, lat, postcode, total_interactions}
    """
    p = parse_filter_params(request)

    # Get all PostcodeAreaInteraction records matching filters
    qs = postcode_qs(p).values("postcode").annotate(total=Sum("interaction_count"))

    rows = []
    postcodes = {r["postcode"] for r in qs}

    # Look up geocodes for all postcodes
    geocodes = {
        pg.postcode: (pg.latitude, pg.longitude)
        for pg in PostcodeGeo.objects.filter(postcode__in=postcodes, status="success")
        if pg.latitude is not None
    }

    # Build result set
    postcode_totals = {r["postcode"]: r["total"] for r in qs}
    for postcode, (lat, lng) in geocodes.items():
        rows.append(
            {
                "postcode": postcode,
                "lng": lng,
                "lat": lat,
                "total": postcode_totals.get(postcode, 0),
            }
        )

    return Response(
        {
            "filters": p,
            "count": len(rows),
            "results": rows,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_heat(request: Request) -> Response:
    """Privacy-grouped clustered postcode data for heatmap visualization.

    Clusters nearby geocoded postcodes within a spatial radius, applies
    k-anonymity thresholds (min postcodes per cluster, min interactions),
    and suppresses sparse clusters to protect privacy.

    Query parameters:
        - radius_meters: clustering radius (default 300m)
        - min_postcodes: k-anonymity threshold (default 2)
        - min_interactions: minimum interactions per cluster (default 5)

    Output: {lng, lat, total, postcode_count, postcodes} (suppressed clusters omitted)
    """
    p = parse_filter_params(request)

    # Parse clustering parameters
    try:
        radius = max(100, min(int(request.GET.get("radius_meters", "300")), 2000))
        min_postcodes = max(1, min(int(request.GET.get("min_postcodes", "2")), 100))
        min_interactions = max(1, min(int(request.GET.get("min_interactions", "5")), 1000))
    except (TypeError, ValueError):
        radius, min_postcodes, min_interactions = 300, 2, 5

    # Get all PostcodeAreaInteraction records matching filters
    qs = postcode_qs(p).values("postcode").annotate(total=Sum("interaction_count"))
    postcode_totals = {r["postcode"]: r["total"] for r in qs}

    # Gather all geocoded postcodes
    postcodes = set(postcode_totals.keys())
    geocodes = PostcodeGeo.objects.filter(postcode__in=postcodes, status="success", latitude__isnull=False)

    points = [
        {
            "postcode": pg.postcode,
            "lng": pg.longitude,
            "lat": pg.latitude,
            "total": postcode_totals.get(pg.postcode, 0),
        }
        for pg in geocodes
    ]

    if not points:
        return Response(
            {
                "filters": p,
                "clustering": {
                    "radius_meters": radius,
                    "min_postcodes": min_postcodes,
                    "min_interactions": min_interactions,
                },
                "count": 0,
                "results": [],
            }
        )

    # Cluster points using privacy-preserving algorithm
    clusters = cluster_points(
        points,
        radius_meters=radius,
        min_postcodes=min_postcodes,
        min_interactions=min_interactions,
    )

    return Response(
        {
            "filters": p,
            "clustering": {
                "radius_meters": radius,
                "min_postcodes": min_postcodes,
                "min_interactions": min_interactions,
            },
            "count": len(clusters),
            "results": clusters,
        }
    )


# ── Journeys (visitor pathways) ────────────────────────────────────────────


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_districts(request: Request) -> Response:
    """Postcode-district summary with optional org breakdown.

    GET /api/analytics/viz/postcode-districts/
    Returns all districts with total interaction counts and centroids.

    GET /api/analytics/viz/postcode-districts/?district=PL1
    Also returns org breakdown for that specific district.
    """
    p = parse_filter_params(request)
    selected = request.GET.get("district", "").strip().upper()

    # Aggregate all postcode records into district buckets.
    qs = postcode_qs(p).order_by().values("postcode", "area").annotate(
        total=Sum("interaction_count")
    )

    district_map: dict[str, dict] = {}
    for row in qs:
        d = _district(row["postcode"]) or _district(row["area"])
        if not d:
            continue
        coords = POSTCODE_CENTROIDS.get(d)
        if not coords:
            continue
        if d not in district_map:
            district_map[d] = {"code": d, "lng": coords[0], "lat": coords[1], "total": 0}
        district_map[d]["total"] += int(row["total"] or 0)

    districts = sorted(district_map.values(), key=lambda x: -x["total"])

    result: dict = {"filters": p, "districts": districts}

    if selected:
        # Org breakdown: match postcodes whose district equals the selection.
        # Use a regex/prefix to avoid "PL1" matching "PL10".
        from django.db.models import Q

        org_rows = (
            postcode_qs(p)
            .filter(Q(postcode__iexact=selected) | Q(postcode__istartswith=f"{selected} "))
            .order_by()
            .values("organisation__name", "organisation_id")
            .annotate(count=Sum("interaction_count"))
            .order_by("-count")
        )

        result["district"] = selected
        result["orgs"] = [
            {
                "organisation": r["organisation__name"] or "",
                "organisation_id": r["organisation_id"],
                "count": int(r["count"] or 0),
            }
            for r in org_rows
        ]

    return Response(result)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def postcode_flows(request: Request) -> Response:
    """Postcode-district → venue flow data for the pathway map.

    Each flow represents the number of interactions from a postcode district
    to an organisation's primary venue.  Respects standard filter params plus
    an optional ``?district=PL1`` to restrict to a single origin district.

    Response shape:
      postcode_nodes  — districts with centroid coords and total counts
      venue_nodes     — one entry per org location that appears in flows
      flows           — from/to coords + count per (district, venue) pair
    """
    from django.db.models import Q as _Q  # local to avoid shadowing outer Q

    p = parse_filter_params(request)
    selected = request.GET.get("district", "").strip().upper()

    qs = postcode_qs(p)
    if selected:
        qs = qs.filter(
            _Q(postcode__iexact=selected) | _Q(postcode__istartswith=f"{selected} ")
        )

    # Aggregate: district × org → total interactions
    rows = list(
        qs.order_by()
        .values("postcode", "area", "organisation_id", "organisation__name")
        .annotate(count=Sum("interaction_count"))
        .order_by("-count")
    )

    # Re-aggregate by (district, org_id) because multiple postcode values can
    # map to the same district (e.g. "PL1 1AB" and "PL1 2BC" both → "PL1").
    district_org: dict[tuple[str, int], int] = {}
    org_names: dict[int, str] = {}
    for r in rows:
        district = _district(r["postcode"]) or _district(r["area"])
        if not district or not r["organisation_id"]:
            continue
        key = (district, r["organisation_id"])
        district_org[key] = district_org.get(key, 0) + int(r["count"] or 0)
        org_names[r["organisation_id"]] = r["organisation__name"] or ""

    # Resolve primary venue (first location by id) for each org.
    org_ids = {oid for (_, oid) in district_org}
    primary_venue: dict[int, dict] = {}
    for loc in (
        Location.objects.filter(organisation_id__in=org_ids)
        .select_related("organisation")
        .order_by("organisation_id", "id")
    ):
        if loc.organisation_id in primary_venue:
            continue
        coords = location_coords(loc)
        if not coords:
            continue
        primary_venue[loc.organisation_id] = {
            "location_id": loc.id,
            "name": loc.name,
            "organisation": loc.organisation.name,
            "lng": coords[0],
            "lat": coords[1],
        }

    postcode_totals: dict[str, dict] = {}
    venue_set: dict[int, dict] = {}
    flows = []

    for (district, oid), count in district_org.items():
        pc_coords = POSTCODE_CENTROIDS.get(district)
        if not pc_coords:
            continue
        venue = primary_venue.get(oid)
        if not venue:
            continue
        if count == 0:
            continue

        # Accumulate postcode node totals.
        if district not in postcode_totals:
            postcode_totals[district] = {
                "code": district,
                "lng": pc_coords[0],
                "lat": pc_coords[1],
                "total": 0,
            }
        postcode_totals[district]["total"] += count

        # Collect venue nodes (deduplicated by location_id).
        lid = venue["location_id"]
        if lid not in venue_set:
            venue_set[lid] = venue

        flows.append({
            "from_code": district,
            "from_lng": pc_coords[0],
            "from_lat": pc_coords[1],
            "to_location_id": lid,
            "to_name": venue["name"],
            "to_org": venue["organisation"],
            "to_lng": venue["lng"],
            "to_lat": venue["lat"],
            "count": count,
        })

    postcode_nodes = sorted(postcode_totals.values(), key=lambda x: -x["total"])
    venue_nodes = sorted(venue_set.values(), key=lambda x: x["name"])

    return Response({
        "filters": p,
        "district": selected or None,
        "postcode_nodes": postcode_nodes,
        "venue_nodes": venue_nodes,
        "flows": sorted(flows, key=lambda x: -x["count"]),
        "flow_count": len(flows),
    })


def _resolve_location(it) -> Location | None:
    """Return the venue for an interaction (direct ``location`` or via ``event``)."""
    if it.location_id and it.location:
        return it.location
    if it.event_id and it.event and it.event.location_id:
        return it.event.location
    return None


def _visitor_sequences(p, *, max_visitors: int, max_steps: int) -> list[tuple[str, list[dict]]]:
    """Build ordered, geo-located visit sequences per anonymised visitor.

    Returns a list of ``(user_hash, steps)`` tuples (most active first) where
    each step is a dict with venue coords and metadata. Visitors with fewer than
    two located steps are dropped (no movement to draw). Ordering within a day
    falls back to ``created_at``/``id`` because ``interaction_date`` is
    day-granular — the visit *order* is the only time dimension available.
    """
    interactions = (
        interactions_qs(p)
        .select_related("event", "event__location", "location", "organisation")
        .order_by("user_hash", "interaction_date", "created_at", "id")
    )

    sequences: dict[str, list[dict]] = {}
    for it in interactions.iterator():
        steps = sequences.setdefault(it.user_hash, [])
        if len(steps) >= max_steps:
            continue
        loc = _resolve_location(it)
        if not loc:
            continue
        coords = location_coords(loc)
        if not coords:
            continue
        steps.append(
            {
                "location_id": loc.id,
                "name": loc.name,
                "organisation": it.organisation.name if it.organisation_id else "",
                "organisation_id": it.organisation_id,
                "lng": coords[0],
                "lat": coords[1],
                "date": it.interaction_date.isoformat() if it.interaction_date else None,
                "type": it.interaction_type,
                "event_id": it.event_id,
                "event_title": (it.event.title if it.event_id and it.event else ""),
            }
        )

    located = [(h, s) for h, s in sequences.items() if len(s) >= 2]
    located.sort(key=lambda hs: len(hs[1]), reverse=True)
    return located[:max_visitors]


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def journeys_paths(request: Request) -> Response:
    """Per-visitor ordered journeys as GeoJSON LineStrings + step lists.

    Each anonymised visitor (8-char hash) becomes one path connecting the venues
    they interacted with, in visit order. Honours the standard FilterBar params
    and an optional ``limit`` (default 50, max 200). Powers the per-visitor
    "Journey map".
    """
    p = parse_filter_params(request)
    try:
        max_visitors = max(1, min(int(request.GET.get("limit", "50")), 200))
    except (TypeError, ValueError):
        max_visitors = 50

    sequences = _visitor_sequences(p, max_visitors=max_visitors, max_steps=100)

    journeys = []
    features = []
    for user_hash, steps in sequences:
        short = user_hash[:8]
        journeys.append({"visitor": short, "step_count": len(steps), "steps": steps})
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[s["lng"], s["lat"]] for s in steps],
                },
                "properties": {"visitor": short, "step_count": len(steps)},
            }
        )

    return Response(
        {
            "filters": p,
            "count": len(journeys),
            "journeys": journeys,
            "geojson": {"type": "FeatureCollection", "features": features},
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def journeys_flows(request: Request) -> Response:
    """Aggregated venue→venue movement flows across all visitors.

    Counts how often visitors move directly from one venue to another (in visit
    order), producing weighted directed edges plus venue nodes. Self-loops
    (consecutive visits to the same venue) are ignored. Honours the standard
    FilterBar params. Powers the "common pathways" view.
    """
    p = parse_filter_params(request)

    sequences = _visitor_sequences(p, max_visitors=1_000_000, max_steps=200)

    edges: dict[tuple[int, int], int] = {}
    node_visits: dict[int, int] = {}
    node_meta: dict[int, dict] = {}

    for _hash, steps in sequences:
        for i, step in enumerate(steps):
            lid = step["location_id"]
            node_visits[lid] = node_visits.get(lid, 0) + 1
            if lid not in node_meta:
                node_meta[lid] = {
                    "location_id": lid,
                    "name": step["name"],
                    "organisation_id": step.get("organisation_id"),
                    "lng": step["lng"],
                    "lat": step["lat"],
                }
            if i == 0:
                continue
            prev = steps[i - 1]["location_id"]
            if prev == lid:
                continue
            key = (prev, lid)
            edges[key] = edges.get(key, 0) + 1

    nodes = [{**meta, "visits": node_visits.get(lid, 0)} for lid, meta in node_meta.items()]
    nodes.sort(key=lambda n: n["visits"], reverse=True)

    flows = []
    features = []
    for (src, dst), count in edges.items():
        a = node_meta[src]
        b = node_meta[dst]
        flows.append(
            {
                "from_id": src,
                "from_name": a["name"],
                "to_id": dst,
                "to_name": b["name"],
                "count": count,
            }
        )
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[a["lng"], a["lat"]], [b["lng"], b["lat"]]],
                },
                "properties": {
                    "from_id": src,
                    "to_id": dst,
                    "from_name": a["name"],
                    "to_name": b["name"],
                    "count": count,
                },
            }
        )

    flows.sort(key=lambda r: r["count"], reverse=True)
    features.sort(key=lambda f: f["properties"]["count"], reverse=True)

    return Response(
        {
            "filters": p,
            "node_count": len(nodes),
            "flow_count": len(flows),
            "nodes": nodes,
            "flows": flows,
            "geojson": {"type": "FeatureCollection", "features": features},
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def org_connections(request: Request) -> Response:
    """Organisation-to-organisation shared-visitor flow graph on a map.

    For each visitor journey, every pair of distinct organisations visited
    produces an edge weighted by the number of visitors who made that
    cross-org transition (direction: first → second in visit order).
    Organisation positions are the centroid of their venue lat/lngs.

    Intended to power the "Org Connections" map — nodes are placed at their
    geographic centroid so pathways can be drawn on a real map.
    Honours the standard FilterBar params.
    """
    p = parse_filter_params(request)

    sequences = _visitor_sequences(p, max_visitors=1_000_000, max_steps=200)

    # org_id → accumulated centroid + visit count
    org_lat: dict[int, float] = {}
    org_lng: dict[int, float] = {}
    org_venue_count: dict[int, int] = {}
    org_visit_count: dict[int, int] = {}
    org_name: dict[int, str] = {}

    # org-pair edges: (src_org_id, dst_org_id) → shared visitor count
    edges: dict[tuple[int, int], int] = {}

    for _hash, steps in sequences:
        seen_orgs_this_visit: list[int] = []
        for step in steps:
            oid = step.get("organisation_id")
            if not oid:
                continue
            # Accumulate centroid from each venue visit
            lat, lng = step["lat"], step["lng"]
            org_lat[oid] = org_lat.get(oid, 0.0) + lat
            org_lng[oid] = org_lng.get(oid, 0.0) + lng
            org_venue_count[oid] = org_venue_count.get(oid, 0) + 1
            org_visit_count[oid] = org_visit_count.get(oid, 0) + 1
            if step.get("organisation"):
                org_name[oid] = step["organisation"]
            seen_orgs_this_visit.append(oid)

        # Build directed org→org edges for each consecutive distinct-org pair
        prev_org: int | None = None
        for oid in seen_orgs_this_visit:
            if prev_org is not None and prev_org != oid:
                key = (prev_org, oid)
                edges[key] = edges.get(key, 0) + 1
            prev_org = oid

    # Build node list with centroid positions
    nodes = []
    for oid, name in org_name.items():
        count = org_venue_count.get(oid, 1)
        nodes.append(
            {
                "id": oid,
                "name": name,
                "lat": org_lat[oid] / count,
                "lng": org_lng[oid] / count,
                "visit_count": org_visit_count.get(oid, 0),
            }
        )
    nodes.sort(key=lambda n: n["visit_count"], reverse=True)

    node_meta = {n["id"]: n for n in nodes}
    flows = []
    for (src, dst), count in edges.items():
        if src not in node_meta or dst not in node_meta:
            continue
        flows.append(
            {
                "from_id": src,
                "from_name": node_meta[src]["name"],
                "to_id": dst,
                "to_name": node_meta[dst]["name"],
                "shared_visitors": count,
            }
        )
    flows.sort(key=lambda r: r["shared_visitors"], reverse=True)

    return Response(
        {
            "filters": p,
            "node_count": len(nodes),
            "flow_count": len(flows),
            "nodes": nodes,
            "flows": flows,
        }
    )
