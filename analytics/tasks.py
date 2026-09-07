"""
Celery tasks for pre-aggregating analytics data.
"""

import logging
from datetime import date, timedelta

from celery import shared_task

from events.models import Event
from organisations.models import Organisation

from .models import DailyStatsSnapshot, UserHashInteraction

logger = logging.getLogger(__name__)


@shared_task
def refresh_daily_stats_snapshot():
    """Recompute today's and yesterday's DailyStatsSnapshot rows.

    Yesterday is included alongside today because a day that was "today"
    at the last hourly run may have picked up late-arriving interactions
    since then; today's row is necessarily partial until the day ends.
    Idempotent — safe to re-run (uses update_or_create per row).
    """
    try:
        for day in (date.today() - timedelta(days=1), date.today()):
            _refresh_day(day)
        logger.info("Refreshed daily stats snapshot for %s and %s", date.today() - timedelta(days=1), date.today())
        return "success"
    except Exception:
        logger.exception("Failed to refresh daily stats snapshot")
        raise


def _refresh_day(day: date) -> None:
    events = Event.objects.filter(start_datetime__date=day)
    interactions = UserHashInteraction.objects.filter(interaction_date=day)

    # City-wide row (organisation=None).
    DailyStatsSnapshot.objects.update_or_create(
        date=day,
        organisation=None,
        defaults={
            "event_count": events.count(),
            "interaction_count": interactions.count(),
            "unique_visitors": interactions.values("user_hash").distinct().count(),
        },
    )

    # Per-organisation rows — only for orgs with any activity that day.
    org_ids = set(events.values_list("organisation_id", flat=True)) | set(
        interactions.values_list("organisation_id", flat=True)
    )
    for org in Organisation.objects.filter(id__in=org_ids):
        org_events = events.filter(organisation=org)
        org_interactions = interactions.filter(organisation=org)
        DailyStatsSnapshot.objects.update_or_create(
            date=day,
            organisation=org,
            defaults={
                "event_count": org_events.count(),
                "interaction_count": org_interactions.count(),
                "unique_visitors": org_interactions.values("user_hash").distinct().count(),
            },
        )
