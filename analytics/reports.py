"""
Report generation: computes per-org analytics for a period and renders a
comprehensive PDF (org digest email attachment + on-demand download).

Reuses the same ``events_qs``/``interactions_qs`` filter helpers the DRF
stats endpoints use — this module just aggregates directly against
querysets instead of going through HTTP, since it's invoked from Celery
tasks and management commands, not requests.
"""

from __future__ import annotations

from datetime import date

from django.db.models import Count
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay
from django.template.loader import render_to_string

from events.models import Category
from organisations.models import Organisation

from .queries import events_qs, interactions_qs, parse_filter_params

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def compute_org_report_data(org: Organisation, period_start: date, period_end: date) -> dict:
    """Aggregate this org's activity for [period_start, period_end] into a
    plain dict ready for the PDF template (and reusable for other report
    formats later)."""
    p = parse_filter_params(
        {
            "org": str(org.pk),
            "date_from": period_start.isoformat(),
            "date_to": period_end.isoformat(),
        }
    )
    events = events_qs(p)
    interactions = interactions_qs(p)

    event_count = events.count()
    interaction_count = interactions.count()
    unique_visitors = interactions.values("user_hash").distinct().count()

    weekday_counts = dict.fromkeys(range(7), 0)
    for row in (
        events.annotate(dow=ExtractIsoWeekDay("start_datetime")).values("dow").annotate(n=Count("id")).order_by()
    ):
        weekday_counts[row["dow"] - 1] = row["n"]

    peak_hours = dict.fromkeys(range(24), 0)
    for row in (
        events.annotate(hour=ExtractHour("start_datetime")).values("hour").annotate(n=Count("id")).order_by("hour")
    ):
        peak_hours[row["hour"]] = row["n"]

    top_venues = list(
        events.exclude(location__isnull=True).values("location__name").annotate(n=Count("id")).order_by("-n")[:10]
    )

    top_categories = list(
        Category.objects.filter(events__in=events).values("name").annotate(n=Count("events")).order_by("-n")[:10]
    )

    return {
        "org": org,
        "period_start": period_start,
        "period_end": period_end,
        "event_count": event_count,
        "interaction_count": interaction_count,
        "unique_visitors": unique_visitors,
        "weekday_series": [{"name": WEEKDAY_NAMES[i], "count": weekday_counts[i]} for i in range(7)],
        "weekday_max": max(weekday_counts.values() or [1]) or 1,
        "peak_hours": [{"hour": h, "count": peak_hours[h]} for h in range(24)],
        "peak_hours_max": max(peak_hours.values() or [1]) or 1,
        "top_venues": top_venues,
        "top_venues_max": max((v["n"] for v in top_venues), default=1) or 1,
        "top_categories": top_categories,
        "top_categories_max": max((c["n"] for c in top_categories), default=1) or 1,
    }


def render_org_report_pdf(org: Organisation, period_start: date, period_end: date) -> bytes:
    """Render the comprehensive per-org PDF report as bytes."""
    from weasyprint import HTML  # imported lazily — heavy, native-lib-backed dependency

    data = compute_org_report_data(org, period_start, period_end)
    html = render_to_string("analytics/reports/org_report.html", data)
    return HTML(string=html).write_pdf()
