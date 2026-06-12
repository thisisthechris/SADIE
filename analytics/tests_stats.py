"""
Tests for the aggregate stats endpoints.

These confirm the new ``/api/analytics/stats/*`` JSON endpoints stay in
parity with the numbers shown by the server-rendered dashboard pages,
since both consume the same helpers in ``analytics.queries``.
"""

from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Category, Event
from organisations.models import Organisation

from .models import PostcodeAreaInteraction, UserHashInteraction


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
