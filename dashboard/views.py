from datetime import date, timedelta
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
    # Load everything in two queries via prefetch; build GeoJSON from the
    # prefetch cache to avoid a separate Location queryset.
    organisations = Organisation.objects.prefetch_related("locations").all()
    features = []
    for org in organisations:
        for loc in org.locations.all():
            if not loc.point:
                continue
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
                    "geometry": {"type": "Point", "coordinates": coords},
                    "properties": {
                        "id": loc.id,
                        "name": loc.name,
                        "organisation": org.name,
                        "postcode": loc.postcode,
                        "address": loc.address,
                    },
                }
            )
    geojson_data = {"type": "FeatureCollection", "features": features}
    context = {"geojson": geojson_data, "organisations": organisations}
    return render(request, "dashboard/map.html", context)


def events_calendar(request):
    """Events grouped by month – limited to 3 months past and 12 months ahead."""
    today = date.today()
    start_date = today - timedelta(days=90)
    end_date = today + timedelta(days=365)
    events = (
        Event.objects.select_related("organisation", "location")
        .filter(start_datetime__date__gte=start_date, start_datetime__date__lte=end_date)
        .order_by("start_datetime")
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
    # Monthly trend – pass raw Python lists so the template can use json_script filter
    monthly_labels_list = [str(r["month"].date()) if r["month"] else "" for r in monthly]
    monthly_data_list = [r["count"] for r in monthly]

    context = {
        "org_stats": list(org_stats),
        "unique_users": list(unique_users),
        "monthly_labels": monthly_labels_list,
        "monthly_data": monthly_data_list,
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
