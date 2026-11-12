"""Tests for the journey pathway endpoints (per-visitor paths + aggregated flows).

Covers ``/api/analytics/viz/journeys-paths/`` and
``/api/analytics/viz/journeys-flows/``.
"""

from datetime import date, timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event
from organisations.models import Location, Organisation

from .journey_flows import rebuild_journey_flows
from .models import JourneyFlowBuild, UserHashInteraction


def _set_point(loc, lng, lat):
    try:
        from django.contrib.gis.geos import Point

        loc.point = Point(lng, lat, srid=4326)
    except Exception:
        loc.point = f"{lng},{lat}"
    loc.save()


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}})
class JourneyPathwayTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Org A")
        cls.loc_a = Location.objects.create(organisation=cls.org, name="Venue A", postcode="PL1 1AA")
        cls.loc_b = Location.objects.create(organisation=cls.org, name="Venue B", postcode="PL4 6AB")
        cls.loc_c = Location.objects.create(organisation=cls.org, name="Venue C", postcode="PL2 2BB")
        _set_point(cls.loc_a, -4.14, 50.37)
        _set_point(cls.loc_b, -4.13, 50.38)
        _set_point(cls.loc_c, -4.15, 50.39)

        now = timezone.now()
        cls.ev_a = Event.objects.create(organisation=cls.org, title="At A", start_datetime=now, location=cls.loc_a)
        cls.ev_b = Event.objects.create(organisation=cls.org, title="At B", start_datetime=now, location=cls.loc_b)
        cls.ev_c = Event.objects.create(organisation=cls.org, title="At C", start_datetime=now, location=cls.loc_c)

        today = date.today()
        # Visitor 1: A → B → C across three days (a clear multi-stop journey).
        for day_offset, ev in [(2, cls.ev_a), (1, cls.ev_b), (0, cls.ev_c)]:
            UserHashInteraction.objects.create(
                user_hash="v1" + "0" * 62,
                interaction_type="event",
                organisation=cls.org,
                event=ev,
                interaction_date=today - timedelta(days=day_offset),
            )
        # Visitor 2: A → B (reinforces the A→B flow edge).
        for day_offset, ev in [(2, cls.ev_a), (1, cls.ev_b)]:
            UserHashInteraction.objects.create(
                user_hash="v2" + "0" * 62,
                interaction_type="event",
                organisation=cls.org,
                event=ev,
                interaction_date=today - timedelta(days=day_offset),
            )
        # Visitor 3: single located stop — must be excluded (no movement).
        UserHashInteraction.objects.create(
            user_hash="v3" + "0" * 62,
            interaction_type="event",
            organisation=cls.org,
            event=cls.ev_a,
            interaction_date=today,
        )

    def setUp(self):
        self.client = APIClient()

    # ── paths ──

    def test_paths_requires_auth_for_write_only(self):
        # Read-only endpoint allows anonymous GET (IsAuthenticatedOrReadOnly).
        r = self.client.get("/api/analytics/viz/journeys-paths/")
        self.assertEqual(r.status_code, 200, r.content)

    def test_paths_shape_and_ordering(self):
        r = self.client.get("/api/analytics/viz/journeys-paths/")
        body = r.json()
        for key in ("filters", "count", "journeys", "geojson"):
            self.assertIn(key, body)

        visitors = {j["visitor"]: j for j in body["journeys"]}
        # Visitor 3 (single stop) excluded; visitors 1 & 2 present.
        self.assertIn("v2000000", visitors)
        self.assertNotIn("v3000000", visitors)

        v1 = visitors["v1000000"]
        self.assertEqual(v1["step_count"], 3)
        self.assertEqual([s["name"] for s in v1["steps"]], ["Venue A", "Venue B", "Venue C"])

        # GeoJSON LineString mirrors the step order.
        feat = next(f for f in body["geojson"]["features"] if f["properties"]["visitor"] == "v1000000")
        self.assertEqual(feat["geometry"]["type"], "LineString")
        self.assertEqual(len(feat["geometry"]["coordinates"]), 3)

    def test_paths_limit(self):
        r = self.client.get("/api/analytics/viz/journeys-paths/?limit=1")
        body = r.json()
        self.assertEqual(body["count"], 1)
        # Most active visitor (v1, 3 stops) wins the single slot.
        self.assertEqual(body["journeys"][0]["visitor"], "v1000000")

    # ── flows ──

    def test_flows_shape_and_counts(self):
        r = self.client.get("/api/analytics/viz/journeys-flows/")
        body = r.json()
        for key in ("filters", "node_count", "flow_count", "nodes", "flows", "geojson"):
            self.assertIn(key, body)

        edges = {(f["from_name"], f["to_name"]): f["count"] for f in body["flows"]}
        # A→B traversed by visitors 1 and 2; B→C only by visitor 1.
        self.assertEqual(edges[("Venue A", "Venue B")], 2)
        self.assertEqual(edges[("Venue B", "Venue C")], 1)
        # No self-loops.
        self.assertNotIn(("Venue A", "Venue A"), edges)

        names = {n["name"] for n in body["nodes"]}
        self.assertEqual(names, {"Venue A", "Venue B", "Venue C"})

    def test_flows_geojson_features(self):
        r = self.client.get("/api/analytics/viz/journeys-flows/")
        feats = r.json()["geojson"]["features"]
        self.assertTrue(feats)
        top = feats[0]
        self.assertEqual(top["geometry"]["type"], "LineString")
        self.assertEqual(len(top["geometry"]["coordinates"]), 2)
        # Sorted by count desc — strongest edge (A→B) first.
        self.assertEqual(top["properties"]["count"], 2)

    # ── pre-computed tables and slices ──

    def _flows(self, **params):
        r = self.client.get("/api/analytics/viz/journeys-flows/", params)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        return d["source"], {(f["from_id"], f["to_id"]): f["count"] for f in d["flows"]}, d

    def test_precomputed_matches_live(self):
        live_source, live, _ = self._flows()
        rebuild_journey_flows()
        source, precomputed, _ = self._flows()
        self.assertEqual((live_source, source), ("live", "precomputed"))
        self.assertEqual(precomputed, live)
        self.assertEqual(precomputed[(self.loc_a.pk, self.loc_b.pk)], 2)

    def test_new_interactions_fall_back_to_live_until_rebuilt(self):
        rebuild_journey_flows()
        UserHashInteraction.objects.create(
            user_hash="v4" + "0" * 62,
            interaction_type="event",
            organisation=self.org,
            event=self.ev_c,
            interaction_date=date.today(),
        )
        self.assertEqual(self._flows()[0], "live")
        rebuild_journey_flows()
        self.assertEqual(self._flows()[0], "precomputed")

    def test_category_filter_is_computed_live(self):
        rebuild_journey_flows()
        self.assertEqual(self._flows(category="1")[0], "live")

    def test_date_range_matches_live_and_slices_by_arrival_day(self):
        today = date.today()
        rebuild_journey_flows()
        sources = []
        for _ in range(2):  # once precomputed, once live (after invalidating the build)
            source, flows, d = self._flows(
                date_from=(today - timedelta(days=1)).isoformat(), date_to=today.isoformat(), slices="2"
            )
            # Only moves with both visits in range: A→B is out (A was two days ago), B→C is in.
            self.assertEqual(flows, {(self.loc_b.pk, self.loc_c.pk): 1})
            self.assertEqual([len(s["flows"]) for s in d["slices"]], [0, 1])
            sources.append(source)
            JourneyFlowBuild.objects.all().delete()
        self.assertEqual(sources, ["precomputed", "live"])
