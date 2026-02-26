import json
from datetime import date
from collections import defaultdict

from django.shortcuts import render
from django.db.models import Count, Sum
from django.db.models.functions import TruncMonth

from organisations.models import Organisation, Location
from events.models import Event
from analytics.models import UserHashInteraction, PostcodeAreaInteraction


def home(request):
    """Dashboard home – high-level stats."""
    context = {
        "org_count": Organisation.objects.count(),
        "location_count": Location.objects.count(),
        "event_count": Event.objects.count(),
        "interaction_count": UserHashInteraction.objects.count(),
        "postcode_count": PostcodeAreaInteraction.objects.aggregate(
            total=Sum("interaction_count")
        )["total"] or 0,
        "recent_events": Event.objects.select_related("organisation", "location")
        .order_by("start_datetime")
        .filter(start_datetime__gte=date.today())[:10],
    }
    return render(request, "dashboard/home.html", context)


def organisations_map(request):
    """Map of all organisations and their locations as GeoJSON."""
    features = []
    for loc in Location.objects.select_related("organisation").exclude(point=None).exclude(point=""):
        # Support both GeoDjango PointField and plain CharField fallback
        try:
            coords = [loc.point.x, loc.point.y]
        except AttributeError:
            # CharField fallback: stored as "lng,lat"
            try:
                lng, lat = str(loc.point).split(",")
                coords = [float(lng), float(lat)]
            except (ValueError, TypeError):
                continue
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": coords,
                },
                "properties": {
                    "id": loc.id,
                    "name": loc.name,
                    "organisation": loc.organisation.name,
                    "postcode": loc.postcode,
                    "address": loc.address,
                },
            }
        )
    geojson = json.dumps({"type": "FeatureCollection", "features": features})
    organisations = Organisation.objects.prefetch_related("locations").all()
    context = {"geojson": geojson, "organisations": organisations}
    return render(request, "dashboard/map.html", context)


def events_calendar(request):
    """Events grouped by month for a simple calendar view."""
    events = Event.objects.select_related("organisation", "location").order_by(
        "start_datetime"
    )
    grouped = defaultdict(list)
    for event in events:
        key = event.start_datetime.strftime("%Y-%m")
        grouped[key].append(event)

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
    context = {"months": months}
    return render(request, "dashboard/calendar.html", context)


def user_journeys(request):
    """Aggregated user-hash journey stats per organisation."""
    org_stats = (
        UserHashInteraction.objects.values("organisation__name", "interaction_type")
        .annotate(count=Count("id"))
        .order_by("organisation__name", "interaction_type")
    )
    # Unique user hashes per organisation
    unique_users = (
        UserHashInteraction.objects.values("organisation__name")
        .annotate(unique_users=Count("user_hash", distinct=True))
        .order_by("organisation__name")
    )
    # Monthly trend
    monthly = (
        UserHashInteraction.objects.annotate(month=TruncMonth("interaction_date"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    monthly_labels = json.dumps([str(r["month"].date()) if r["month"] else "" for r in monthly])
    monthly_data = json.dumps([r["count"] for r in monthly])

    context = {
        "org_stats": list(org_stats),
        "unique_users": list(unique_users),
        "monthly_labels": monthly_labels,
        "monthly_data": monthly_data,
    }
    return render(request, "dashboard/journeys.html", context)


def postcode_heatmap(request):
    """Postcode interaction data for heatmap display."""
    records = (
        PostcodeAreaInteraction.objects.select_related("organisation")
        .order_by("-interaction_count")[:200]
    )
    # Build summary by postcode area
    area_totals = (
        PostcodeAreaInteraction.objects.values("area")
        .annotate(total=Sum("interaction_count"))
        .order_by("-total")[:20]
    )
    context = {
        "records": records,
        "area_totals": list(area_totals),
    }
    return render(request, "dashboard/postcodes.html", context)
