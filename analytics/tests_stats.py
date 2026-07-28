"""
Tests for the aggregate stats endpoints.

These confirm the new ``/api/analytics/stats/*`` JSON endpoints stay in
parity with the numbers shown by the server-rendered dashboard pages,
since both consume the same helpers in ``analytics.queries``.
"""

from datetime import date, datetime, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Category, Event
from organisations.models import Organisation

from .models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)


class StatsEndpointsTest(TestCase):
    """End-to-end smoke tests + filter-application checks."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("u", password="pw")
        cls.org_a = Organisation.objects.create(name="Org A")
        cls.org_b = Organisation.objects.create(name="Org B")
        cls.cat_music = Category.objects.create(name="Music")
        cls.cat_film = Category.objects.create(name="Film")

        # 3 events for org A (2 music, 1 film), 1 event for org B (music)
        now = timezone.now()
        for i in range(3):
            e = Event.objects.create(
                organisation=cls.org_a,
                title=f"A{i}",
                start_datetime=now + timedelta(days=i),
            )
            e.categories.add(cls.cat_music if i < 2 else cls.cat_film)
        e = Event.objects.create(
            organisation=cls.org_b,
            title="B0",
            start_datetime=now + timedelta(days=1),
        )
        e.categories.add(cls.cat_music)

        # Interactions: 5 for A, 2 for B; one of A is type=location
        for i in range(5):
            UserHashInteraction.objects.create(
                user_hash=f"{i:064d}",
                interaction_type="location" if i == 0 else "event",
                organisation=cls.org_a,
                interaction_date=date.today() - timedelta(days=i),
            )
        for i in range(2):
            UserHashInteraction.objects.create(
                user_hash=f"b{i:063d}",
                interaction_type="event",
                organisation=cls.org_b,
                interaction_date=date.today(),
            )

        PostcodeAreaInteraction.objects.create(
            organisation=cls.org_a,
            postcode="PL1 1AA",
            area="PL1",
            interaction_count=10,
            period_start=date.today() - timedelta(days=30),
            period_end=date.today(),
        )
        PostcodeAreaInteraction.objects.create(
            organisation=cls.org_b,
            postcode="PL4 6AB",
            area="PL4",
            interaction_count=4,
            period_start=date.today() - timedelta(days=30),
            period_end=date.today(),
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_summary_counts(self):
        r = self.client.get("/api/analytics/stats/summary/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["org_count"], 2)
        self.assertEqual(d["event_count"], 4)
        self.assertEqual(d["interaction_count"], 7)
        self.assertEqual(d["unique_visitors"], 7)
        self.assertEqual(d["postcode_count"], 14)

    def test_summary_filtered_by_org(self):
        r = self.client.get(f"/api/analytics/stats/summary/?org={self.org_a.pk}")
        d = r.json()
        self.assertEqual(d["event_count"], 3)
        self.assertEqual(d["interaction_count"], 5)
        self.assertEqual(d["postcode_count"], 10)

    def test_summary_filtered_by_category(self):
        r = self.client.get(f"/api/analytics/stats/summary/?category={self.cat_film.pk}")
        self.assertEqual(r.json()["event_count"], 1)

    def test_summary_filtered_by_itype(self):
        r = self.client.get("/api/analytics/stats/summary/?itype=location")
        self.assertEqual(r.json()["interaction_count"], 1)

    def test_summary_period_shortcut(self):
        r = self.client.get("/api/analytics/stats/summary/?period=7d")
        # All interactions are within last 7d in this fixture
        self.assertEqual(r.json()["interaction_count"], 7)

    def test_top_orgs_ordered(self):
        r = self.client.get("/api/analytics/stats/top-orgs/")
        results = r.json()["results"]
        self.assertEqual(results[0]["organisation_id"], self.org_a.pk)
        self.assertEqual(results[0]["n"], 3)
        self.assertEqual(results[1]["n"], 1)

    def test_top_categories(self):
        r = self.client.get("/api/analytics/stats/top-categories/")
        results = r.json()["results"]
        names = {row["name"]: row["n"] for row in results}
        self.assertEqual(names.get("Music"), 3)
        self.assertEqual(names.get("Film"), 1)

    def test_interactions_timeseries_returns_list(self):
        r = self.client.get("/api/analytics/stats/interactions-timeseries/")
        d = r.json()
        self.assertIn("series", d)
        self.assertGreaterEqual(len(d["series"]), 1)
        total = sum(p["count"] for p in d["series"])
        self.assertEqual(total, 7)

    def test_interactions_by_type(self):
        r = self.client.get("/api/analytics/stats/interactions-by-type/")
        rows = {r["interaction_type"]: r["n"] for r in r.json()["results"]}
        self.assertEqual(rows.get("event"), 6)
        self.assertEqual(rows.get("location"), 1)

    def test_postcode_aggregates(self):
        r = self.client.get("/api/analytics/stats/postcode-aggregates/")
        d = r.json()
        by_area = {row["area"]: row["total"] for row in d["by_area"]}
        self.assertEqual(by_area.get("PL1"), 10)
        self.assertEqual(by_area.get("PL4"), 4)
        self.assertEqual(len(d["by_postcode"]), 2)

    def test_headline_no_org_filter(self):
        """Test headline endpoint returns city-wide stats."""
        r = self.client.get("/api/analytics/stats/headline/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["scope_label"], "City (all)")
        self.assertIn("current_period", d)
        self.assertIn("previous_period", d)
        self.assertIn("deltas", d)
        # Should have some counts (exact values depend on fixture dates)
        self.assertIsInstance(d["current_period"]["events_count"], int)
        self.assertIsInstance(d["current_period"]["attendees_count"], int)
        self.assertIsInstance(d["deltas"]["events_pct_change"], float)
        self.assertIsInstance(d["deltas"]["attendees_pct_change"], float)

    def test_headline_org_filter(self):
        """Test headline endpoint respects org filter."""
        r = self.client.get(f"/api/analytics/stats/headline/?org={self.org_a.pk}")
        d = r.json()
        self.assertEqual(d["scope_label"], "Org A")
        # Org A should have >= 0 events/attendees in the periods
        self.assertIsInstance(d["current_period"]["events_count"], int)
        self.assertIsInstance(d["current_period"]["attendees_count"], int)


class CategoryEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        Category.objects.create(name="Theatre")
        Category.objects.create(name="Dance")

    def test_list_categories(self):
        r = self.client.get("/api/events/categories/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["count"], 2)


class NewChartsStatsEndpointsTest(TestCase):
    """Tests for peak-times, attendance-frequency, event-lead-time, lead-time-trend."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("u2", password="pw")
        cls.org_a = Organisation.objects.create(name="Org A")
        cls.org_b = Organisation.objects.create(name="Org B")

        tz = timezone.get_current_timezone()
        cls.e_morning1 = Event.objects.create(
            organisation=cls.org_a,
            title="Morning 1",
            start_datetime=timezone.make_aware(datetime(2026, 1, 5, 9, 0), tz),
        )
        cls.e_morning2 = Event.objects.create(
            organisation=cls.org_a,
            title="Morning 2",
            start_datetime=timezone.make_aware(datetime(2026, 1, 6, 9, 30), tz),
        )
        cls.e_evening = Event.objects.create(
            organisation=cls.org_b,
            title="Evening",
            start_datetime=timezone.make_aware(datetime(2026, 1, 7, 18, 0), tz),
        )

        # Backdate created_at (auto_now_add ignores create() kwargs, so use update()).
        Event.objects.filter(pk=cls.e_morning1.pk).update(
            created_at=cls.e_morning1.start_datetime - timedelta(days=10)
        )
        Event.objects.filter(pk=cls.e_morning2.pk).update(
            created_at=cls.e_morning2.start_datetime - timedelta(days=20)
        )
        Event.objects.filter(pk=cls.e_evening.pk).update(created_at=cls.e_evening.start_datetime - timedelta(days=2))

        # Backdated listing (created AFTER the event happened) -> excluded from lead-time averages.
        cls.e_backdated = Event.objects.create(
            organisation=cls.org_a,
            title="Backdated",
            start_datetime=timezone.make_aware(datetime(2026, 1, 1, 12, 0), tz),
        )
        Event.objects.filter(pk=cls.e_backdated.pk).update(
            created_at=cls.e_backdated.start_datetime + timedelta(days=5)
        )

        # Attendance frequency: v1 attends 1 event, v2 attends 2, v3 attends 3, v4 attends 4 (all).
        events_pool = [cls.e_morning1, cls.e_morning2, cls.e_evening, cls.e_backdated]
        attend_counts = {"v1": 1, "v2": 2, "v3": 3, "v4": 4}
        for user_hash, n in attend_counts.items():
            for i in range(n):
                UserHashInteraction.objects.create(
                    user_hash=user_hash,
                    interaction_type="event",
                    organisation=events_pool[i].organisation,
                    event=events_pool[i],
                    interaction_date=date.today(),
                )
        # Location-only interaction should NOT count as attendance.
        UserHashInteraction.objects.create(
            user_hash="v5",
            interaction_type="location",
            organisation=cls.org_a,
            interaction_date=date.today(),
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_peak_times_counts_by_hour(self):
        r = self.client.get("/api/analytics/stats/peak-times/")
        self.assertEqual(r.status_code, 200)
        series = r.json()["series"]
        self.assertEqual(len(series), 24)
        by_hour = {row["hour"]: row["events"] for row in series}
        self.assertEqual(by_hour[9], 2)
        self.assertEqual(by_hour[18], 1)
        self.assertEqual(by_hour[12], 1)

    def test_attendance_frequency_buckets(self):
        r = self.client.get("/api/analytics/stats/attendance-frequency/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        buckets = {row["bucket"]: row["visitors"] for row in d["series"]}
        self.assertEqual(buckets["1"], 1)
        self.assertEqual(buckets["2"], 1)
        self.assertEqual(buckets["3"], 1)
        self.assertEqual(buckets["4+"], 1)
        self.assertEqual(d["summary"]["total_visitors"], 4)
        self.assertEqual(d["summary"]["gt3_count"], 1)

    def test_event_lead_time_by_org_and_exclusion(self):
        r = self.client.get("/api/analytics/stats/event-lead-time/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["excluded_count"], 1)
        by_org = {row["organisation__name"]: row for row in d["by_org"]}
        self.assertAlmostEqual(by_org["Org A"]["avg_days"], 15.0, delta=0.1)
        self.assertEqual(by_org["Org A"]["event_count"], 2)
        self.assertAlmostEqual(by_org["Org B"]["avg_days"], 2.0, delta=0.1)

    def test_lead_time_trend_monthly(self):
        r = self.client.get("/api/analytics/stats/lead-time-trend/")
        self.assertEqual(r.status_code, 200)
        series = r.json()["series"]
        self.assertTrue(any(row["month"] == "2026-01-01" for row in series))

    def test_activity_by_weekday_merges_same_weekday_events(self):
        """Regression test: two events on the same weekday but different exact
        start_datetime must be summed, not silently overwrite each other via
        Event's default Meta.ordering leaking into the GROUP BY clause."""
        tz = timezone.get_current_timezone()
        Event.objects.create(
            organisation=self.org_a,
            title="Same weekday A",
            start_datetime=timezone.make_aware(datetime(2026, 1, 5, 9, 0), tz),
        )
        Event.objects.create(
            organisation=self.org_a,
            title="Same weekday B",
            start_datetime=timezone.make_aware(datetime(2026, 1, 12, 15, 0), tz),
        )
        r = self.client.get("/api/analytics/stats/activity-by-weekday/")
        self.assertEqual(r.status_code, 200)
        series = r.json()["series"]
        monday = next(row for row in series if row["weekday_name"] == "Monday")
        self.assertGreaterEqual(monday["events"], 2)


class PostcodeAndTicketStatsEndpointsTest(TestCase):
    """Tests for peak-times-by-postcode, event-types-by-postcode,
    postcode-engagement-trend, and ticket-volume-trend."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("u3", password="pw")
        cls.org = Organisation.objects.create(name="Org C")
        cls.cat_music = Category.objects.create(name="Gig")
        cls.cat_film = Category.objects.create(name="Screening")

        tz = timezone.get_current_timezone()
        cls.e_morning = Event.objects.create(
            organisation=cls.org,
            title="Morning gig",
            start_datetime=timezone.make_aware(datetime(2026, 2, 1, 9, 0), tz),
        )
        cls.e_morning.categories.add(cls.cat_music)
        cls.e_evening = Event.objects.create(
            organisation=cls.org,
            title="Evening screening",
            start_datetime=timezone.make_aware(datetime(2026, 2, 2, 19, 0), tz),
        )
        cls.e_evening.categories.add(cls.cat_film)

        # PL1 skews morning/music, PL4 skews evening/film.
        PostcodeEventInteraction.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            event=cls.e_morning,
            interaction_count=10,
            interaction_date=date(2026, 2, 1),
        )
        PostcodeEventInteraction.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            event=cls.e_evening,
            interaction_count=2,
            interaction_date=date(2026, 2, 2),
        )
        PostcodeEventInteraction.objects.create(
            organisation=cls.org,
            postcode="PL4 6AB",
            area="PL4",
            event=cls.e_evening,
            interaction_count=6,
            interaction_date=date(2026, 2, 2),
        )

        PostcodeAreaInteraction.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            interaction_count=50,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
        )
        PostcodeAreaInteraction.objects.create(
            organisation=cls.org,
            postcode="PL4 6AB",
            area="PL4",
            interaction_count=5,
            period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31),
        )
        PostcodeAreaInteraction.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            interaction_count=20,
            period_start=date(2026, 2, 1),
            period_end=date(2026, 2, 28),
        )

        PostcodeTicketPurchase.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            event=cls.e_morning,
            ticket_quantity=3,
            purchase_date=date(2026, 1, 15),
        )
        PostcodeTicketPurchase.objects.create(
            organisation=cls.org,
            postcode="PL1 1AA",
            area="PL1",
            event=cls.e_morning,
            ticket_quantity=2,
            purchase_date=date(2026, 1, 20),
        )
        PostcodeTicketPurchase.objects.create(
            organisation=cls.org,
            postcode="PL4 6AB",
            area="PL4",
            event=cls.e_evening,
            ticket_quantity=4,
            purchase_date=date(2026, 2, 5),
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_peak_times_by_postcode_buckets_by_daypart(self):
        r = self.client.get("/api/analytics/stats/peak-times-by-postcode/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["dayparts"], ["Morning", "Afternoon", "Evening", "Night"])
        self.assertIn("PL1", d["districts"])
        self.assertIn("PL4", d["districts"])
        pl1_rows = {row["daypart"]: row["count"] for row in d["series"] if row["district"] == "PL1"}
        self.assertEqual(pl1_rows["Morning"], 10)
        self.assertEqual(pl1_rows["Evening"], 2)
        pl4_rows = {row["daypart"]: row["count"] for row in d["series"] if row["district"] == "PL4"}
        self.assertEqual(pl4_rows["Evening"], 6)

    def test_peak_times_by_postcode_limit(self):
        r = self.client.get("/api/analytics/stats/peak-times-by-postcode/?limit=1")
        d = r.json()
        # PL1's total (10+2=12) outranks PL4's (6), so only PL1 survives the limit.
        self.assertEqual(d["districts"], ["PL1"])

    def test_event_types_by_postcode(self):
        r = self.client.get("/api/analytics/stats/event-types-by-postcode/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertIn("Gig", d["categories"])
        self.assertIn("Screening", d["categories"])
        pl1_rows = {row["category"]: row["count"] for row in d["series"] if row["district"] == "PL1"}
        self.assertEqual(pl1_rows["Gig"], 10)
        self.assertEqual(pl1_rows["Screening"], 2)

    def test_postcode_engagement_trend_monthly_by_district(self):
        r = self.client.get("/api/analytics/stats/postcode-engagement-trend/")
        self.assertEqual(r.status_code, 200)
        series = r.json()["series"]
        pl1_rows = {row["month"]: row["count"] for row in series if row["category"] == "PL1"}
        self.assertEqual(pl1_rows["2026-01-01"], 50)
        self.assertEqual(pl1_rows["2026-02-01"], 20)

    def test_ticket_volume_trend_monthly(self):
        r = self.client.get("/api/analytics/stats/ticket-volume-trend/")
        self.assertEqual(r.status_code, 200)
        series = {row["month"]: row for row in r.json()["series"]}
        self.assertEqual(series["2026-01-01"]["tickets"], 5)
        self.assertEqual(series["2026-01-01"]["orders"], 2)
        self.assertEqual(series["2026-02-01"]["tickets"], 4)
        self.assertEqual(series["2026-02-01"]["orders"], 1)
