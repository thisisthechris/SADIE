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
        cls.loc_a = Location.objects.create(organisation=cls.org_a, name="Venue A", postcode="PL1 1AA")
        cls.loc_b = Location.objects.create(organisation=cls.org_b, name="Venue B", postcode="PL4 6AB")
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

        # PL1 area postcodes (15 postcodes with varying interactions)
        pl1_postcodes = [
            ("PL1 1AA", 145),
            ("PL1 1AB", 98),
            ("PL1 1AC", 67),
            ("PL1 2AA", 112),
            ("PL1 2AB", 89),
            ("PL1 2AC", 56),
            ("PL1 3AA", 134),
            ("PL1 3AB", 78),
            ("PL1 3AC", 92),
            ("PL1 4AA", 101),
            ("PL1 4AB", 73),
            ("PL1 4AC", 44),
            ("PL1 5AA", 187),
            ("PL1 5AB", 65),
            ("PL1 5AC", 53),
        ]
        for postcode, count in pl1_postcodes:
            PostcodeAreaInteraction.objects.create(
                organisation=cls.org_a,
                postcode=postcode,
                area="PL1",
                interaction_count=count,
                period_start=date.today() - timedelta(days=30),
                period_end=date.today(),
            )

        # PL4 area postcodes (15 postcodes with varying interactions)
        pl4_postcodes = [
            ("PL4 0AA", 156),
            ("PL4 0AB", 89),
            ("PL4 0AC", 72),
            ("PL4 6AA", 124),
            ("PL4 6AB", 103),
            ("PL4 6AC", 58),
            ("PL4 7AA", 167),
            ("PL4 7AB", 94),
            ("PL4 7AC", 71),
            ("PL4 8AA", 138),
            ("PL4 8AB", 85),
            ("PL4 8AC", 51),
            ("PL4 9AA", 142),
            ("PL4 9AB", 76),
            ("PL4 9AC", 63),
        ]
        for postcode, count in pl4_postcodes:
            PostcodeAreaInteraction.objects.create(
                organisation=cls.org_b,
                postcode=postcode,
                area="PL4",
                interaction_count=count,
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
        # Verify PL1 and PL4 districts have data with coordinates
        self.assertIn("PL1", by_district)
        self.assertIn("PL4", by_district)
        self.assertGreater(by_district["PL1"]["total"], 0)
        self.assertGreater(by_district["PL4"]["total"], 0)
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
        self.assertTrue(any(link["type"] == "org_category" for link in data["links"]))
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
        r = self.c.get(f"/api/analytics/viz/event-list/?org={self.org_b.id}&limit=10")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertEqual(data["count"], 1)
        self.assertEqual(data["limit"], 10)
        self.assertEqual(data["results"][0]["organisation_id"], self.org_b.id)

    def test_postcode_records(self):
        r = self.c.get("/api/analytics/viz/postcode-records/")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        # Test creates 15 PL1 records for org_a + 15 PL4 records for org_b = 30 total
        self.assertEqual(data["count"], 30)
        # ordered by -interaction_count, first should be highest
        self.assertGreater(data["results"][0]["interaction_count"], 0)
        first = data["results"][0]
        for key in ("id", "postcode", "area", "organisation", "interaction_count", "period_start", "period_end"):
            self.assertIn(key, first)

    def test_postcode_records_org_filter_and_limit(self):
        r = self.c.get(f"/api/analytics/viz/postcode-records/?org={self.org_b.id}&limit=5")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        # Test creates 15 PL4 records for org_b, but limit=5 restricts to first 5
        self.assertEqual(data["count"], 5)
        self.assertEqual(data["limit"], 5)
        self.assertEqual(data["results"][0]["organisation_id"], self.org_b.id)
