"""Pre-computed venue→venue movement for the Common Pathways map.

Building every visitor's journey from raw interactions on each request is
O(interactions) and was the main cost of the map. ``rebuild_journey_flows``
does that work once (nightly, and after imports) and stores daily totals in
``JourneyFlowDaily`` / ``JourneyNodeDaily``; ``precomputed_flows`` then answers
a request by summing those rows for the selected scope and date range.

Journeys are built over all time. Each move row records the day of the visit it
leaves and the day it arrives, and a date range keeps only moves with both days
inside it, matching the live calculation. Slices go by arrival day. Venue visit
counts include any visitor with two located visits overall, so a venue's total
can be slightly higher than the live figure for short ranges. Category and
interaction-type filters can't be answered from these tables; the view computes
those live.
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Mapping
from datetime import date

from celery import shared_task
from django.db import transaction
from django.db.models import Count, Max, Sum

from organisations.models import Location, Organisation, org_and_descendants_ids

from .models import JourneyFlowBuild, JourneyFlowDaily, JourneyNodeDaily, UserHashInteraction
from .queries import location_coords

# Per-visitor step cap, matching the live journeys_flows computation.
MAX_STEPS = 200
_BATCH_SIZE = 5000
_BUILDS_KEPT = 20

Edge = tuple[int, int]


def _located_location_ids() -> set[int]:
    return {loc.id for loc in Location.objects.all() if location_coords(loc)}


def _scope_moves(org_ids: list[int] | None, located: set[int]):
    """Daily moves and visits for one scope: ({(from_day, day, from, to): n}, {(day, loc): n})."""
    qs = UserHashInteraction.objects.all()
    if org_ids is not None:
        qs = qs.filter(organisation_id__in=org_ids)
    rows = qs.order_by("user_hash", "interaction_date", "created_at", "id").values_list(
        "user_hash", "interaction_date", "location_id", "event__location_id"
    )

    moves: dict[tuple[date, date, int, int], int] = defaultdict(int)
    visits: dict[tuple[date, int], int] = defaultdict(int)

    def add_visitor(steps: list[tuple[date, int]]) -> None:
        if len(steps) < 2:
            return
        for i, (day, loc) in enumerate(steps):
            visits[(day, loc)] += 1
            if i and steps[i - 1][1] != loc:
                from_day, from_loc = steps[i - 1]
                moves[(from_day, day, from_loc, loc)] += 1

    current, steps = None, []
    for user_hash, day, location_id, event_location_id in rows.iterator(chunk_size=_BATCH_SIZE):
        if user_hash != current:
            add_visitor(steps)
            current, steps = user_hash, []
        # Same rule as viz_views._resolve_location: the interaction's own venue wins.
        loc = location_id or event_location_id
        if day is None or loc not in located or len(steps) >= MAX_STEPS:
            continue
        steps.append((day, loc))
    add_visitor(steps)
    return moves, visits


def rebuild_journey_flows() -> JourneyFlowBuild:
    """Recompute the journey tables for all of Plymouth and every organisation."""
    started = time.monotonic()
    located = _located_location_ids()
    scopes: list[tuple[int | None, list[int] | None]] = [(None, None)]
    org_ids = Organisation.objects.values_list("id", flat=True)
    scopes += [(org_id, org_and_descendants_ids(org_id)) for org_id in org_ids]

    flow_rows: list[JourneyFlowDaily] = []
    node_rows: list[JourneyNodeDaily] = []
    for scope_id, org_ids in scopes:
        moves, visits = _scope_moves(org_ids, located)
        flow_rows += [
            JourneyFlowDaily(
                scope_id=scope_id, from_day=from_day, day=day, from_location_id=a, to_location_id=b, count=n
            )
            for (from_day, day, a, b), n in moves.items()
        ]
        node_rows += [
            JourneyNodeDaily(scope_id=scope_id, day=day, location_id=loc, visits=n) for (day, loc), n in visits.items()
        ]

    with transaction.atomic():
        JourneyFlowDaily.objects.all().delete()
        JourneyNodeDaily.objects.all().delete()
        JourneyFlowDaily.objects.bulk_create(flow_rows, batch_size=_BATCH_SIZE)
        JourneyNodeDaily.objects.bulk_create(node_rows, batch_size=_BATCH_SIZE)
        build = JourneyFlowBuild.objects.create(
            **_interaction_fingerprint(),
            flow_rows=len(flow_rows),
            duration_ms=int((time.monotonic() - started) * 1000),
        )
        old = JourneyFlowBuild.objects.values_list("pk", flat=True)[_BUILDS_KEPT:]
        JourneyFlowBuild.objects.filter(pk__in=list(old)).delete()
    return build


@shared_task(name="analytics.rebuild_journey_flows")
def rebuild_journey_flows_task() -> str:
    """Nightly rebuild (see CELERY_BEAT_SCHEDULE), then drop cached responses built from old rows."""
    from .caching import invalidate_stats_cache

    build = rebuild_journey_flows()
    invalidate_stats_cache()
    return str(build)


def _interaction_fingerprint() -> dict[str, int]:
    """Cheap summary of the interactions table, to tell whether the tables are current."""
    agg = UserHashInteraction.objects.aggregate(n=Count("id"), top=Max("id"))
    return {"interaction_count": agg["n"] or 0, "max_interaction_id": agg["top"] or 0}


def tables_are_current() -> bool:
    """True if the latest build still matches the interactions table.

    Any import, deletion or synthetic top-up changes the count or highest id, so
    the view falls back to the live computation until the tables are rebuilt.
    """
    build = JourneyFlowBuild.objects.first()
    if build is None:
        return False
    current = _interaction_fingerprint()
    return (build.interaction_count, build.max_interaction_id) == (
        current["interaction_count"],
        current["max_interaction_id"],
    )


def precomputed_flows(p: Mapping[str, str], slice_bounds: list[tuple[date, date]]):
    """Answer a flows request from the journey tables, or None if they can't.

    Returns ``(node_visits, node_meta, edges, slice_edges)`` in the same shape the
    live computation in ``viz_views.journeys_flows`` produces.
    """
    if p.get("cat") or p.get("itype") or not tables_are_current():
        return None
    try:
        scope = int(p["org"]) if p.get("org") else None
    except (TypeError, ValueError):
        return None

    flows = JourneyFlowDaily.objects.filter(scope_id=scope)
    nodes = JourneyNodeDaily.objects.filter(scope_id=scope)
    if p.get("dfrom"):
        flows = flows.filter(from_day__gte=p["dfrom"])
        nodes = nodes.filter(day__gte=p["dfrom"])
    if p.get("dto"):
        flows = flows.filter(day__lte=p["dto"])
        nodes = nodes.filter(day__lte=p["dto"])

    node_visits = {
        loc: n for loc, n in nodes.values("location_id").annotate(n=Sum("visits")).values_list("location_id", "n")
    }
    edges: dict[Edge, int] = defaultdict(int)
    slice_edges: list[dict[Edge, int]] = [defaultdict(int) for _ in slice_bounds]
    daily = flows.values("day", "from_location_id", "to_location_id").annotate(n=Sum("count"))
    for row in daily.values_list("day", "from_location_id", "to_location_id", "n"):
        day, a, b, n = row
        edges[(a, b)] += n
        for i, (start, end) in enumerate(slice_bounds):
            if start <= day <= end:
                slice_edges[i][(a, b)] += n
                break

    ids = set(node_visits) | {loc for edge in edges for loc in edge}
    node_meta = {}
    for loc in Location.objects.filter(pk__in=ids):
        coords = location_coords(loc)
        if coords:
            node_meta[loc.id] = {
                "location_id": loc.id,
                "name": loc.name,
                "organisation_id": loc.organisation_id,
                "lng": coords[0],
                "lat": coords[1],
            }
    return node_visits, node_meta, dict(edges), [dict(e) for e in slice_edges]
