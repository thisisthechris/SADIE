from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Category, Event
from organisations.models import Organisation

from .models import DailyStatsSnapshot, PostcodeAreaInteraction, UserHashInteraction
from .queries import interactions_qs, parse_filter_params
from .reports import compute_org_report_data, render_org_report_pdf
from .tasks import _digest_is_due, detect_anomalies, refresh_daily_stats_snapshot, send_scheduled_digests


def make_org(name="Test Org"):
    return Organisation.objects.create(name=name)


class UserHashInteractionModelTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.event = Event.objects.create(
            organisation=self.org,
            title="Test Event",
            start_datetime=timezone.now(),
        )
        self.interaction = UserHashInteraction.objects.create(
            user_hash="a" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )

    def test_str_contains_hash_prefix(self):
        self.assertIn("aaaaaaaa", str(self.interaction))

    def test_ordering_newest_first(self):
        yesterday = (timezone.now() - timezone.timedelta(days=1)).date()
        UserHashInteraction.objects.create(
            user_hash="b" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=yesterday,
        )
        first = UserHashInteraction.objects.first()
        self.assertEqual(first, self.interaction)


class PostcodeAreaInteractionModelTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.record = PostcodeAreaInteraction.objects.create(
            organisation=self.org,
            postcode="EC1A",
            area="Islington",
            interaction_count=10,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
        )

    def test_str(self):
        s = str(self.record)
        self.assertIn("EC1A", s)
        self.assertIn("Test Org", s)


class InteractionsQsCategoryFilterTest(TestCase):
    """interactions_qs must scope by category, same as events_qs — was previously missing."""

    def setUp(self):
        self.org = make_org()
        self.music = Category.objects.create(name="Music")
        self.theatre = Category.objects.create(name="Theatre")
        self.music_event = Event.objects.create(
            organisation=self.org, title="Gig", start_datetime=timezone.now()
        )
        self.music_event.categories.add(self.music)
        self.theatre_event = Event.objects.create(
            organisation=self.org, title="Play", start_datetime=timezone.now()
        )
        self.theatre_event.categories.add(self.theatre)
        UserHashInteraction.objects.create(
            user_hash="a" * 64,
            interaction_type="event",
            event=self.music_event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )
        UserHashInteraction.objects.create(
            user_hash="b" * 64,
            interaction_type="event",
            event=self.theatre_event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )

    def test_category_filter_excludes_other_categories(self):
        p = parse_filter_params({"category": str(self.music.pk)})
        qs = interactions_qs(p)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().event_id, self.music_event.pk)

    def test_no_category_filter_returns_all(self):
        p = parse_filter_params({})
        self.assertEqual(interactions_qs(p).count(), 2)


class OrgReportTest(TestCase):
    def setUp(self):
        from datetime import date, datetime

        self.org = make_org()
        self.location = None
        from organisations.models import Location

        self.location = Location.objects.create(organisation=self.org, name="Main Hall")
        self.category = Category.objects.create(name="Music")
        self.event = Event.objects.create(
            organisation=self.org,
            location=self.location,
            title="Gig",
            start_datetime=datetime(2026, 1, 15, 19, 0),
        )
        self.event.categories.add(self.category)
        UserHashInteraction.objects.create(
            user_hash="a" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=date(2026, 1, 15),
        )
        self.period_start = date(2026, 1, 1)
        self.period_end = date(2026, 1, 31)

    def test_compute_org_report_data(self):
        data = compute_org_report_data(self.org, self.period_start, self.period_end)
        self.assertEqual(data["event_count"], 1)
        self.assertEqual(data["interaction_count"], 1)
        self.assertEqual(data["unique_visitors"], 1)
        self.assertEqual(data["top_venues"][0]["location__name"], "Main Hall")
        self.assertEqual(data["top_categories"][0]["name"], "Music")

    def test_render_org_report_pdf(self):
        pdf_bytes = render_org_report_pdf(self.org, self.period_start, self.period_end)
        self.assertGreater(len(pdf_bytes), 100)
        self.assertTrue(pdf_bytes.startswith(b"%PDF"))


class SendScheduledDigestsTaskTest(TestCase):
    def setUp(self):
        from datetime import date

        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.org = make_org()
        self.user = User.objects.create_user("member1", email="member1@example.com", password="x")
        self.org.members.add(self.user)
        self.today = date(2026, 1, 12)  # a Monday

    def test_weekly_digest_sends_when_due(self):
        from .models import OrgReportSubscription

        sub = OrgReportSubscription.objects.create(organisation=self.org, frequency="weekly", weekday=0)
        self.assertTrue(_digest_is_due(sub, self.today))

    def test_weekly_digest_not_due_on_other_weekday(self):
        from .models import OrgReportSubscription

        sub = OrgReportSubscription.objects.create(organisation=self.org, frequency="weekly", weekday=2)
        self.assertFalse(_digest_is_due(sub, self.today))

    def test_weekly_digest_not_due_if_sent_recently(self):
        from .models import OrgReportSubscription

        sub = OrgReportSubscription.objects.create(
            organisation=self.org, frequency="weekly", weekday=0, last_sent_at=timezone.now()
        )
        self.assertFalse(_digest_is_due(sub, self.today))

    def test_send_scheduled_digests_emails_members(self):
        from datetime import date

        from django.core import mail

        from .models import OrgReportSubscription

        today_weekday = date.today().weekday()
        OrgReportSubscription.objects.create(organisation=self.org, frequency="weekly", weekday=today_weekday)
        sent = send_scheduled_digests()
        self.assertEqual(sent, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertEqual(len(mail.outbox[0].attachments), 1)

    def test_send_scheduled_digests_skips_org_with_no_member_emails(self):
        from datetime import date

        from .models import OrgReportSubscription

        other_org = Organisation.objects.create(name="No Email Org")
        today_weekday = date.today().weekday()
        OrgReportSubscription.objects.create(organisation=other_org, frequency="weekly", weekday=today_weekday)
        sent = send_scheduled_digests()
        self.assertEqual(sent, 0)


class DetectAnomaliesTaskTest(TestCase):
    def setUp(self):
        from datetime import date, timedelta

        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.org = make_org()
        self.user = User.objects.create_user("member2", email="member2@example.com", password="x")
        self.org.members.add(self.user)

        today = date.today()
        this_week_start = today - timedelta(days=today.weekday())
        # 8 baseline weeks with natural variance around ~10/week (not a
        # constant, so stddev > 0 and a z-score is actually computable).
        # Weeks 2..9 back — week 1 back (prev_week) is left empty so it
        # reads as a sharp drop against the baseline.
        weekly_counts = [8, 9, 10, 11, 12, 10, 9, 11]
        for i, n in enumerate(weekly_counts, start=2):
            w_start = this_week_start - timedelta(days=7 * i)
            for d in range(n):
                UserHashInteraction.objects.create(
                    user_hash=f"baseline{i}{d}".ljust(64, "0"),
                    interaction_type="event",
                    organisation=self.org,
                    interaction_date=w_start + timedelta(days=d % 7),
                )
        # Last week (i=1 back): a sharp drop (0 interactions) — should trip the anomaly.
        self.prev_week_start = this_week_start - timedelta(days=7)

    def test_detects_and_emails_drop(self):
        from django.core import mail

        alerted = detect_anomalies()
        self.assertEqual(alerted, 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)

    def test_does_not_double_alert_same_week(self):
        detect_anomalies()
        alerted_again = detect_anomalies()
        self.assertEqual(alerted_again, 0)


class ReportSubscriptionAndDownloadTest(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.staff = User.objects.create_user("staffrep", password="x", is_staff=True)
        self.member = User.objects.create_user("memberrep", password="x")
        self.outsider = User.objects.create_user("outsiderrep", password="x")
        self.org = make_org("Report Sub Org")
        self.org.members.add(self.member)
        self.client = APIClient()

    def test_get_creates_default_subscription(self):
        self.client.force_authenticate(self.member)
        r = self.client.get(f"/api/analytics/reports/organisations/{self.org.pk}/subscription/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["frequency"], "off")

    def test_member_can_update_own_org_subscription(self):
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            f"/api/analytics/reports/organisations/{self.org.pk}/subscription/",
            {"frequency": "weekly", "weekday": 2},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["frequency"], "weekly")
        self.assertEqual(r.data["weekday"], 2)

    def test_outsider_cannot_update_subscription(self):
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            f"/api/analytics/reports/organisations/{self.org.pk}/subscription/",
            {"frequency": "weekly"},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_invalid_frequency_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.patch(
            f"/api/analytics/reports/organisations/{self.org.pk}/subscription/",
            {"frequency": "daily"},
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_download_report_pdf(self):
        self.client.force_authenticate(self.member)
        r = self.client.get(f"/api/analytics/reports/organisations/{self.org.pk}/pdf/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r["Content-Type"], "application/pdf")
        self.assertTrue(r.content.startswith(b"%PDF"))

    def test_download_requires_auth(self):
        r = self.client.get(f"/api/analytics/reports/organisations/{self.org.pk}/pdf/")
        self.assertIn(r.status_code, (401, 403))


class RefreshDailyStatsSnapshotTaskTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.today = timezone.now().date()
        self.event = Event.objects.create(
            organisation=self.org,
            title="Test Event",
            start_datetime=timezone.now(),
        )
        UserHashInteraction.objects.create(
            user_hash="a" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=self.today,
        )
        UserHashInteraction.objects.create(
            user_hash="b" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=self.today,
        )

    def test_creates_city_wide_and_per_org_rows(self):
        refresh_daily_stats_snapshot()
        city_row = DailyStatsSnapshot.objects.get(date=self.today, organisation=None)
        org_row = DailyStatsSnapshot.objects.get(date=self.today, organisation=self.org)
        self.assertEqual(city_row.interaction_count, 2)
        self.assertEqual(city_row.unique_visitors, 2)
        self.assertEqual(org_row.event_count, 1)
        self.assertEqual(org_row.interaction_count, 2)

    def test_idempotent_on_rerun(self):
        refresh_daily_stats_snapshot()
        refresh_daily_stats_snapshot()
        self.assertEqual(
            DailyStatsSnapshot.objects.filter(date=self.today, organisation=self.org).count(), 1
        )


class AnalyticsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = make_org()
        self.event = Event.objects.create(
            organisation=self.org,
            title="Event",
            start_datetime=timezone.now(),
        )
        UserHashInteraction.objects.create(
            user_hash="c" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )
        PostcodeAreaInteraction.objects.create(
            organisation=self.org,
            postcode="W1A",
            area="Westminster",
            interaction_count=5,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
        )

    def test_list_interactions(self):
        response = self.client.get("/api/analytics/interactions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_list_postcodes(self):
        response = self.client.get("/api/analytics/postcodes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_upload_interaction_requires_token(self):
        response = self.client.post(
            "/api/upload/interactions/",
            data=[
                {
                    "user_hash": "d" * 64,
                    "interaction_type": "event",
                    "organisation": self.org.pk,
                    "event": self.event.pk,
                    "interaction_date": str(timezone.now().date()),
                }
            ],
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_upload_interaction_with_token(self):
        from django.conf import settings

        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        response = self.client.post(
            "/api/upload/interactions/",
            data=[
                {
                    "user_hash": "e" * 64,
                    "interaction_type": "event",
                    "organisation": self.org.pk,
                    "event": self.event.pk,
                    "interaction_date": str(timezone.now().date()),
                }
            ],
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["created"], 1)
