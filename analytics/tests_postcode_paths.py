"""Tests for the postcode-cohort pathway feature.

Covers the ``PostcodeEventInteraction`` upload endpoint plus the
``/api/analytics/viz/postcode-pathways/`` (venue→venue connections) and the
event-linked ``/api/analytics/viz/postcode-flows/`` (postcode→venue spokes)
endpoints. Mirrors the user-journey model but sourced from postcode uploads.
"""

from datetime import timedelta

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event
from organisations.models import Location, Organisation

from .models import PostcodeEventInteraction


def _set_point(loc, lng, lat):
    try:
        from django.contrib.gis.geos import Point

        loc.point = Point(lng, lat, srid=4326)
    except Exception:  # pragma: no cover - CharField fallback when GDAL absent
        loc.point = f"{lng},{lat}"
    loc.save()


class PostcodePathwayTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Org A")
        # Venues sit inside PL1 for a stable, centroid-backed origin district.
        cls.loc_a = Location.objects.create(organisation=cls.org, name="Venue A", postcode="PL1 1AA")
        cls.loc_b = Location.objects.create(organisation=cls.org, name="Venue B", postcode="PL1 4AB")
        cls.loc_c = Location.objects.create(organisation=cls.org, name="Venue C", postcode="PL1 2BB")
        _set_point(cls.loc_a, -4.14, 50.37)
        _set_point(cls.loc_b, -4.13, 50.38)
        _set_point(cls.loc_c, -4.15, 50.39)

        now = timezone.now()
        # Events staggered in time so ordering by event date is deterministic.
        cls.ev_a = Event.objects.create(
            organisation=cls.org, title="At A", start_datetime=now - timedelta(days=2), location=cls.loc_a
        )
        cls.ev_b = Event.objects.create(
            organisation=cls.org, title="At B", start_datetime=now - timedelta(days=1), location=cls.loc_b
        )
        cls.ev_c = Event.objects.create(organisation=cls.org, title="At C", start_datetime=now, location=cls.loc_c)

        # Postcode PL1 cohort: A(50) → B(30) → C(20). Ordering by event date.
        for ev, count in [(cls.ev_a, 50), (cls.ev_b, 30), (cls.ev_c, 20)]:
            PostcodeEventInteraction.objects.create(
                organisation=cls.org,
                postcode="PL1 1AA",
                area="City Centre",
                event=ev,
                location=ev.location,
                interaction_count=count,
                interaction_date=ev.start_datetime.date(),
            )
        # Postcode PL2 cohort: A(10) → B(40) — reinforces the A→B edge.
        for ev, count in [(cls.ev_a, 10), (cls.ev_b, 40)]:
            PostcodeEventInteraction.objects.create(
                organisation=cls.org,
                postcode="PL2 2AA",
                area="North",
                event=ev,
                location=ev.location,
                interaction_count=count,
                interaction_date=ev.start_datetime.date(),
            )

    def setUp(self):
        self.client = APIClient()

    # ── upload ──

    def test_upload_requires_token(self):
        r = self.client.post(
            "/api/upload/postcode-events/",
            data=[{"postcode": "PL4 0AB", "event": self.ev_a.pk, "interaction_count": 5}],
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_upload_derives_org_location_and_date_from_event(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-events/",
            data=[{"postcode": "PL4 0AB", "event": self.ev_a.pk, "interaction_count": 7}],
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["created"], 1)

        rec = PostcodeEventInteraction.objects.get(postcode="PL4 0AB")
        self.assertEqual(rec.organisation_id, self.org.pk)
        self.assertEqual(rec.location_id, self.loc_a.pk)
        self.assertEqual(rec.interaction_date, self.ev_a.start_datetime.date())

    def test_upload_rejects_missing_event(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-events/",
            data=[{"postcode": "PL4 0AB", "interaction_count": 7}],
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_upload_rejects_nonpositive_count(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-events/",
            data=[{"postcode": "PL4 0AB", "event": self.ev_a.pk, "interaction_count": 0}],
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    # ── pathways (venue→venue) ──

    def test_pathways_shape(self):
        r = self.client.get("/api/analytics/viz/postcode-pathways/")
        body = r.json()
        for key in ("filters", "node_count", "flow_count", "nodes", "flows", "postcode_nodes", "geojson"):
            self.assertIn(key, body)

    def test_pathways_edges_and_min_weighting(self):
        r = self.client.get("/api/analytics/viz/postcode-pathways/")
        body = r.json()
        edges = {(f["from_id"], f["to_id"]): f["count"] for f in body["flows"]}

        # A→B: PL1 min(50,30)=30 + PL2 min(10,40)=10 = 40.
        self.assertEqual(edges[(self.loc_a.pk, self.loc_b.pk)], 40)
        # B→C: only PL1 min(30,20)=20.
        self.assertEqual(edges[(self.loc_b.pk, self.loc_c.pk)], 20)
        # No direct A→C edge (never consecutive).
        self.assertNotIn((self.loc_a.pk, self.loc_c.pk), edges)

    def test_pathways_postcode_nodes_present(self):
        r = self.client.get("/api/analytics/viz/postcode-pathways/")
        codes = {n["code"] for n in r.json()["postcode_nodes"]}
        self.assertIn("PL1", codes)
        self.assertIn("PL2", codes)

    def test_pathways_district_filter_scopes_to_one_cohort(self):
        r = self.client.get("/api/analytics/viz/postcode-pathways/?district=PL2")
        body = r.json()
        # Only PL2 is an origin now.
        self.assertEqual({n["code"] for n in body["postcode_nodes"]}, {"PL2"})
        edges = {(f["from_id"], f["to_id"]): f["count"] for f in body["flows"]}
        # PL2 cohort is A(10)→B(40): only the A→B edge, weighted min(10,40)=10.
        self.assertEqual(edges, {(self.loc_a.pk, self.loc_b.pk): 10})

    def test_pathways_geojson_linestrings(self):
        r = self.client.get("/api/analytics/viz/postcode-pathways/")
        feats = r.json()["geojson"]["features"]
        self.assertTrue(feats)
        for f in feats:
            self.assertEqual(f["geometry"]["type"], "LineString")
            self.assertEqual(len(f["geometry"]["coordinates"]), 2)

    # ── flows (postcode→venue, real event venues) ──

    def test_flows_use_real_event_venues(self):
        r = self.client.get("/api/analytics/viz/postcode-flows/")
        body = r.json()
        venue_ids = {v["location_id"] for v in body["venue_nodes"]}
        self.assertEqual(venue_ids, {self.loc_a.pk, self.loc_b.pk, self.loc_c.pk})

        # PL1 → Venue A spoke carries the uploaded cohort count (50).
        pl1_to_a = [f for f in body["flows"] if f["from_code"] == "PL1" and f["to_location_id"] == self.loc_a.pk]
        self.assertEqual(len(pl1_to_a), 1)
        self.assertEqual(pl1_to_a[0]["count"], 50)

    def test_flows_district_filter(self):
        r = self.client.get("/api/analytics/viz/postcode-flows/?district=PL2")
        body = r.json()
        self.assertEqual(body["district"], "PL2")
        self.assertTrue(all(f["from_code"] == "PL2" for f in body["flows"]))
