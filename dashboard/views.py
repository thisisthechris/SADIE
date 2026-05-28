from collections import defaultdict
from datetime import date, timedelta

from django.contrib.auth.decorators import login_required
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth
from django.shortcuts import render

from analytics.queries import (
    events_qs as _events_qs,
    interactions_qs as _interactions_qs,
    location_coords as _loc_coords,
    parse_filter_params as _filter_params,
    postcode_qs as _postcode_qs,
)
from events.models import Category
from organisations.models import Location, Organisation

# Approximate centroids for Plymouth-area postcode districts (lat, lng).
POSTCODE_CENTROIDS = {
    "PL1": [50.3714, -4.1427],
    "PL2": [50.3680, -4.1620],
    "PL3": [50.3830, -4.1520],
    "PL4": [50.3760, -4.1300],
    "PL5": [50.3950, -4.1700],
    "PL6": [50.4050, -4.1350],
    "PL7": [50.3850, -4.0850],
    "PL8": [50.3480, -4.0650],
    "PL9": [50.3580, -4.0900],
    "PL10": [50.3650, -4.2050],
    "PL11": [50.3620, -4.2200],
    "PL12": [50.3850, -4.2000],
    "PL13": [50.3600, -4.4700],
    "PL14": [50.4500, -4.3800],
    "PL15": [50.5400, -4.3500],
    "PL20": [50.5100, -4.0800],
    "PL21": [50.3870, -3.9600],
}


# ── Filter helpers ────────────────────────────────────────────────────────
#
# The queryset / parameter helpers used to live here. They have moved to
# ``analytics.queries`` so the new DRF stats endpoints share one source of
# truth. The dashboard imports them as their original underscore-prefixed
# names so the view bodies below can stay unchanged.
#
# Only ``_filter_ctx`` remains here because it produces template-context only.


def _filter_ctx(p):
    """Template-context dict for the shared filter bar."""
    return {
        "all_organisations": Organisation.objects.all(),
        "all_categories": Category.objects.all(),
        "f_org": p["org"],
        "f_cat": p["cat"],
        "f_from": p["dfrom"],
        "f_to": p["dto"],
        "f_search": p["search"],
        "f_period": p["period"],
        "f_itype": p["itype"],
    }


# ── Views ─────────────────────────────────────────────────────────────────


@login_required
def home(request):
    """Dashboard home – stats cards, top orgs, top categories, recent events."""
    p = _filter_params(request)
    events = _events_qs(p)
    interactions = _interactions_qs(p)
    postcodes = _postcode_qs(p)

    top_orgs = (
        events.values("organisation__id", "organisation__name")
        .annotate(n=Count("id"))
        .order_by("-n")[:6]
    )
    top_cats = (
        Category.objects.filter(events__in=events)
        .annotate(n=Count("events"))
        .order_by("-n")[:8]
    )
    type_breakdown = list(
        interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n")
    )

    context = {
        "org_count": Organisation.objects.count(),
        "location_count": Location.objects.count(),
        "event_count": events.count(),
        "interaction_count": interactions.count(),
        "unique_visitors": interactions.values("user_hash").distinct().count(),
        "postcode_count": postcodes.aggregate(t=Sum("interaction_count"))["t"] or 0,
        "recent_events": (
            events.select_related("organisation", "location")
            .filter(start_datetime__gte=date.today())
            .order_by("start_datetime")[:10]
        ),
        "top_orgs": top_orgs,
        "top_cats": top_cats,
        "type_breakdown": type_breakdown,
        **_filter_ctx(p),
    }
    return render(request, "dashboard/home.html", context)


@login_required
def organisations_map(request):
    """Map of organisation venues with event-count badges."""
    p = _filter_params(request)
    orgs = Organisation.objects.prefetch_related("locations").all()
    if p["org"]:
        orgs = orgs.filter(id=p["org"])

    loc_event_counts = {}
    for row in _events_qs(p).values("location_id").annotate(n=Count("id")):
        if row["location_id"]:
            loc_event_counts[row["location_id"]] = row["n"]

    features = []
    for org in orgs:
        for loc in org.locations.all():
            coords = _loc_coords(loc)
            if not coords:
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": coords},
                    "properties": {
                        "id": loc.id,
                        "name": loc.name,
                        "organisation": org.name,
                        "postcode": loc.postcode,
                        "address": loc.address,
                        "event_count": loc_event_counts.get(loc.id, 0),
                    },
                }
            )

    context = {
        "geojson": {"type": "FeatureCollection", "features": features},
        "organisations": Organisation.objects.all(),
        **_filter_ctx(p),
    }
    return render(request, "dashboard/map.html", context)


@login_required
def events_map(request):
    """Map of events grouped by location, with full filtering."""
    p = _filter_params(request)
    events = (
        _events_qs(p)
        .select_related("organisation", "location")
        .prefetch_related("categories")
    )

    loc_groups = defaultdict(list)
    for ev in events:
        if ev.location_id:
            loc_groups[ev.location_id].append(ev)

    features = []
    for loc_id, evts in loc_groups.items():
        loc = evts[0].location
        coords = _loc_coords(loc)
        if not coords:
            continue
        cats = set()
        titles = []
        for ev in evts[:25]:
            titles.append(
                {
                    "title": ev.title,
                    "date": ev.start_datetime.strftime("%d %b %H:%M"),
                    "org": ev.organisation.name,
                    "url": ev.url or "",
                }
            )
            for c in ev.categories.all():
                cats.add(c.name)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {
                    "name": loc.name,
                    "postcode": loc.postcode,
                    "event_count": len(evts),
                    "categories": list(cats),
                    "events": titles,
                },
            }
        )

    context = {
        "geojson": {"type": "FeatureCollection", "features": features},
        "total_events": events.count(),
        "total_locations": len(features),
        **_filter_ctx(p),
    }
    return render(request, "dashboard/events_map.html", context)


@login_required
def events_calendar(request):
    """Events grouped by month with filters."""
    p = _filter_params(request)
    if not p["dfrom"]:
        p["dfrom"] = (date.today() - timedelta(days=90)).isoformat()
    if not p["dto"]:
        p["dto"] = (date.today() + timedelta(days=365)).isoformat()

    events = (
        _events_qs(p)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("start_datetime")
    )

    grouped = defaultdict(list)
    for ev in events:
        grouped[ev.start_datetime.strftime("%Y-%m")].append(ev)

    months = []
    for key in sorted(grouped.keys()):
        year, month = key.split("-")
        months.append(
            {
                "label": date(int(year), int(month), 1).strftime("%B %Y"),
                "key": key,
                "events": grouped[key],
            }
        )

    context = {
        "months": months,
        "total_events": events.count(),
        **_filter_ctx(p),
    }
    # Subscribe links (filter-aware) for the calendar page.
    from .ics_feed import calendar_subscribe_urls

    context.update(calendar_subscribe_urls(request))
    return render(request, "dashboard/calendar.html", context)


@login_required
def user_journeys(request):
    """User journey analytics with org / date / type filters."""
    p = _filter_params(request)
    interactions = _interactions_qs(p)

    org_stats = list(
        interactions.values("organisation__name", "interaction_type")
        .annotate(count=Count("id"))
        .order_by("organisation__name", "interaction_type")
    )
    unique_users = list(
        interactions.values("organisation__name")
        .annotate(unique_users=Count("user_hash", distinct=True))
        .order_by("organisation__name")
    )

    monthly = (
        interactions.annotate(month=TruncMonth("interaction_date"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    monthly_labels = [
        str(r["month"].date() if hasattr(r["month"], "date") else r["month"])
        if r["month"]
        else ""
        for r in monthly
    ]
    monthly_data = [r["count"] for r in monthly]

    type_totals = list(
        interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n")
    )
    top_users = list(
        interactions.values("user_hash").annotate(n=Count("id")).order_by("-n")[:10]
    )

    context = {
        "org_stats": org_stats,
        "unique_users": unique_users,
        "monthly_labels": monthly_labels,
        "monthly_data": monthly_data,
        "type_totals": type_totals,
        "top_users": top_users,
        "total_interactions": interactions.count(),
        "total_unique": interactions.values("user_hash").distinct().count(),
        **_filter_ctx(p),
    }
    return render(request, "dashboard/journeys.html", context)


@login_required
def postcode_heatmap(request):
    """Postcode interaction data – table, chart and map."""
    p = _filter_params(request)
    qs = _postcode_qs(p)

    records = qs.select_related("organisation").order_by("-interaction_count")[:200]
    area_totals = list(
        qs.values("area")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")[:20]
    )

    # Build map data: circles at postcode-district centroids.
    # area_totals uses friendly names, so resolve via the postcode field instead.
    # Aggregate interaction totals by postcode, then group by district prefix.
    postcode_rows = (
        qs.values("postcode")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")
    )
    import re as _re

    district_totals: dict[str, dict] = {}
    for row in postcode_rows:
        pc = (row["postcode"] or "").strip().upper()
        # Extract district prefix  e.g. "PL1 2TR" → "PL1", "PL10 1AA" → "PL10"
        m = _re.match(r"^([A-Z]{1,2}\d{1,2})", pc)
        if not m:
            continue
        district = m.group(1)
        if district in district_totals:
            district_totals[district]["total"] += row["total"]
        else:
            centroid = POSTCODE_CENTROIDS.get(district)
            if centroid:
                district_totals[district] = {
                    "area": district,
                    "lat": centroid[0],
                    "lng": centroid[1],
                    "total": row["total"],
                }

    # Also try matching area_totals by name for any manually keyed entries
    for row in area_totals:
        area = row["area"] or ""
        if area in POSTCODE_CENTROIDS and area not in district_totals:
            centroid = POSTCODE_CENTROIDS[area]
            district_totals[area] = {
                "area": area,
                "lat": centroid[0],
                "lng": centroid[1],
                "total": row["total"],
            }

    map_features = sorted(district_totals.values(), key=lambda d: -d["total"])

    context = {
        "records": records,
        "area_totals": area_totals,
        "map_features": map_features,
        **_filter_ctx(p),
    }
    return render(request, "dashboard/postcodes.html", context)
