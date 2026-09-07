"""
Celery tasks for pre-aggregating analytics data, sending scheduled report
digests, and detecting week-over-week anomalies.
"""

import logging
import statistics
from datetime import date, timedelta

from celery import shared_task
from django.core.mail import EmailMessage
from django.utils import timezone

from events.models import Event
from organisations.models import Organisation

from .models import AnomalyAlert, DailyStatsSnapshot, OrgReportSubscription, UserHashInteraction
from .reports import render_org_report_pdf

logger = logging.getLogger(__name__)

# Number of trailing weeks used to establish the "normal" baseline for
# anomaly detection, and the z-score magnitude that counts as significant.
ANOMALY_BASELINE_WEEKS = 8
ANOMALY_Z_THRESHOLD = 2.0


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


def _month_bounds(d: date) -> tuple[date, date]:
    import calendar

    last_day = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, 1), date(d.year, d.month, last_day)


def _digest_period(sub: "OrgReportSubscription", today: date) -> tuple[date, date]:
    if sub.frequency == "weekly":
        period_end = today - timedelta(days=1)
        period_start = period_end - timedelta(days=6)
        return period_start, period_end
    # monthly — the previous full calendar month.
    first_of_this_month = date(today.year, today.month, 1)
    last_of_prev_month = first_of_this_month - timedelta(days=1)
    first_of_prev_month = date(last_of_prev_month.year, last_of_prev_month.month, 1)
    return first_of_prev_month, last_of_prev_month


def _digest_is_due(sub: "OrgReportSubscription", today: date) -> bool:
    if sub.frequency == "weekly":
        if today.weekday() != sub.weekday:
            return False
        return sub.last_sent_at is None or (today - sub.last_sent_at.date()).days >= 7
    if sub.frequency == "monthly":
        _, last_day_of_month = _month_bounds(today)
        effective_day = min(sub.day_of_month, last_day_of_month.day)
        if today.day != effective_day:
            return False
        return sub.last_sent_at is None or sub.last_sent_at.date().replace(day=1) != today.replace(day=1)
    return False


@shared_task
def send_scheduled_digests():
    """Send each organisation's configured (weekly/monthly) PDF report digest.

    Runs daily; ``_digest_is_due`` decides whether *today* is actually this
    org's send day, so the schedule itself just needs to run at least once
    a day.
    """
    today = date.today()
    sent = 0
    for sub in OrgReportSubscription.objects.exclude(frequency="off").select_related("organisation"):
        try:
            if not _digest_is_due(sub, today):
                continue
            org = sub.organisation
            recipients = list(org.members.exclude(email="").values_list("email", flat=True))
            if not recipients:
                logger.info("Skipping digest for %s — no member email addresses", org.name)
                continue
            period_start, period_end = _digest_period(sub, today)
            pdf_bytes = render_org_report_pdf(org, period_start, period_end)
            email = EmailMessage(
                subject=f"Your {sub.get_frequency_display().lower()} SADIE report — {org.name}",
                body=(
                    f"Attached is {org.name}'s activity report for "
                    f"{period_start.isoformat()} to {period_end.isoformat()}.\n\n— SADIE"
                ),
                to=recipients,
            )
            email.attach(f"{org.slug}-report.pdf", pdf_bytes, "application/pdf")
            email.send(fail_silently=False)
            sub.last_sent_at = timezone.now()
            sub.save(update_fields=["last_sent_at"])
            sent += 1
        except Exception:
            logger.exception("Failed to send digest for organisation %s", sub.organisation_id)
    logger.info("Sent %d digest(s)", sent)
    return sent


@shared_task
def detect_anomalies():
    """Flag organisations whose interaction count this week is a
    statistically significant deviation (|z-score| > threshold) from their
    trailing baseline, and email their members once per anomalous week.
    """
    today = date.today()
    this_week_start = today - timedelta(days=today.weekday())
    prev_week_start = this_week_start - timedelta(days=7)

    alerted = 0
    for org in Organisation.objects.all():
        try:
            # Baseline = the ANOMALY_BASELINE_WEEKS weeks *before* prev_week
            # (i=1 would be prev_week itself — excluded so it can't compare
            # against its own data).
            baseline = []
            for i in range(2, ANOMALY_BASELINE_WEEKS + 2):
                w_start = this_week_start - timedelta(days=7 * i)
                w_end = w_start + timedelta(days=6)
                count = UserHashInteraction.objects.filter(
                    organisation=org, interaction_date__gte=w_start, interaction_date__lte=w_end
                ).count()
                baseline.append(count)
            if len(baseline) < 2 or all(v == 0 for v in baseline):
                continue

            actual = UserHashInteraction.objects.filter(
                organisation=org,
                interaction_date__gte=prev_week_start,
                interaction_date__lte=this_week_start - timedelta(days=1),
            ).count()

            mean = statistics.mean(baseline)
            stdev = statistics.pstdev(baseline)
            if stdev == 0:
                continue
            z = (actual - mean) / stdev
            if abs(z) < ANOMALY_Z_THRESHOLD:
                continue

            if AnomalyAlert.objects.filter(
                organisation=org, metric="interactions", week_start=prev_week_start
            ).exists():
                continue

            recipients = list(org.members.exclude(email="").values_list("email", flat=True))
            AnomalyAlert.objects.create(
                organisation=org,
                metric="interactions",
                week_start=prev_week_start,
                actual_value=actual,
                baseline_mean=mean,
                baseline_stddev=stdev,
                z_score=z,
            )
            if not recipients:
                logger.info("Anomaly detected for %s but no member emails to alert", org.name)
                continue
            direction = "dropped" if z < 0 else "spiked"
            EmailMessage(
                subject=f"SADIE alert: interactions {direction} for {org.name}",
                body=(
                    f"{org.name}'s interactions for the week of {prev_week_start.isoformat()} "
                    f"were {actual:.0f}, versus a typical {mean:.0f} "
                    f"(±{stdev:.0f}) over the last {ANOMALY_BASELINE_WEEKS} weeks.\n\n— SADIE"
                ),
                to=recipients,
            ).send(fail_silently=False)
            alerted += 1
        except Exception:
            logger.exception("Anomaly detection failed for organisation %s", org.pk)
    logger.info("Sent %d anomaly alert(s)", alerted)
    return alerted
