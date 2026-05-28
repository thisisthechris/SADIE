"""
Tests for the Phase 3 3D-visualisation data endpoints.

Smoke + correctness tests for ``/api/analytics/viz/*`` endpoints.
"""

from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Category, Event
from organisations.models import Location, Organisation

from .models import PostcodeAreaInteraction, UserHashInteraction


class VizEndpointsTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(name="Org A")
        cls.org_b = Organisation.objects.create(name="Org B")
        cls.cat_music = Category.objects.create(name="Music")
        cls.cat_film = Category.objects.create(name="Film")

        # Locations — point may be PointField or "lng,lat" CharField fallback.
        cls.loc_a = Location.objects.create(
            organisation=cls.org_a, name="Venue A", postcode="PL1 1AA"
        )
        cls.loc_b = Location.objects.create(
            organisation=cls.org_b, name="Venue B", postcode="PL4 6AB"
        )
        # Set coords via raw assignment to support both backends.
        for loc, lng, lat in [(cls.loc_a, -4.14, 50.37), (cls.loc_b, -4.13, 50.38)]:
            try:
                from django.contrib.gis.geos import Point

                loc.point = Point(lng, lat, srid=4326)
            except Exception:
                loc.point = f"{lng},{lat}"
            loc.save()

        now = timezone.now()
        for i in range(3):
            ev = Event.objects.create(
                organisation=cls.org_a,
                title=f"A{i}",
                start_datetime=now + timedelta(days=i),
                location=cls.loc_a,
            )
            ev.categories.add(cls.cat_music if i < 2 else cls.cat_film)
        ev = Event.objects.create(
            organisation=cls.org_b,
            title="B0",
            start_datetime=now + timedelta(days=1),
            location=cls.loc_b,
        )
        ev.categories.add(cls.cat_music)

        for i in range(5):
            UserHashInteraction.objects.create(
                user_hash=f"u{i:063d}",
                interaction_type="event",
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
        self.c = APIClient()

    def test_event_points(self):
        r = self.c.get("/api/analytics/viz/event-points/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        rows = {row["location_id"]: row for row in data["results"]}
        self.assertEqual(rows[self.loc_a.id]["event_count"], 3)
        self.assertEqual(rows[self.loc_b.id]["event_count"], 1)
        self.assertAlmostEqual(rows[self.loc_a.id]["lng"], -4.14, places=2)

    def test_event_points_org_filter(self):
        r = self.c.get(f"/api/analytics/viz/event-points/?org={self.org_a.id}")
        self.assertEqual(r.status_code, 200)
        rows = r.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["organisation_id"], self.org_a.id)

    def test_postcode_bars(self):
        r = self.c.get("/api/analytics/viz/postcode-bars/")
        self.assertEqual(r.status_code, 200)
        rows = r.json()["results"]
        by_district = {row["district"]: row for row in rows}
        self.assertEqual(by_district["PL1"]["total"], 10)
        self.assertEqual(by_district["PL4"]["total"], 4)
        self.assertIn("lng", by_district["PL1"])
        self.assertIn("lat", by_district["PL1"])

    def test_network(self):
        r = self.c.get("/api/analytics/viz/network/?buckets=4")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        types = {n["type"] for n in data["nodes"]}
        self.assertIn("organisation", types)
        self.assertIn("category", types)
        self.assertIn("user_cluster", types)
        # Org→category links exist
        self.assertTrue(
            any(link["type"] == "org_category" for link in data["links"])
        )
        self.assertTrue(any(link["type"] == "org_user" for link in data["links"]))
        # Bucketing bound
        clusters = [n for n in data["nodes"] if n["type"] == "user_cluster"]
        self.assertLessEqual(len(clusters), 4)

    def test_spatiotemporal(self):
        r = self.c.get("/api/analytics/viz/spatiotemporal/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 4)
        for row in data["results"]:
            self.assertIn("lng", row)
            self.assertIn("lat", row)
            self.assertIn("t", row)
        self.assertIsNotNone(data["earliest"])

    def test_event_list(self):
        r = self.c.get("/api/analytics/viz/event-list/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 4)
        first = data["results"][0]
        for key in ("id", "title", "lng", "lat", "start", "organisation", "location_name"):
            self.assertIn(key, first)

    def test_event_list_org_filter_and_limit(self):
        r = self.c.get(
            f"/api/analytics/viz/event-list/?org={self.org_b.id}&limit=10"
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["limit"], 10)
        self.assertEqual(data["results"][0]["organisation_id"], self.org_b.id)

    def test_postcode_records(self):
        r = self.c.get("/api/analytics/viz/postcode-records/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 2)
        # ordered by -interaction_count
        self.assertEqual(data["results"][0]["interaction_count"], 10)
        first = data["results"][0]
        for key in ("id", "postcode", "area", "organisation", "interaction_count",
                    "period_start", "period_end"):
            self.assertIn(key, first)

    def test_postcode_records_org_filter_and_limit(self):
        r = self.c.get(
            f"/api/analytics/viz/postcode-records/?org={self.org_b.id}&limit=5"
        )
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["limit"], 5)
        self.assertEqual(data["results"][0]["organisation_id"], self.org_b.id)
