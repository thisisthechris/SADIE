"""Tests for the postcode ticket-volume feature.

Covers the ``PostcodeTicketPurchase`` upload endpoint plus the
``/api/analytics/viz/postcode-ticket-districts/``,
``/api/analytics/viz/postcode-ticket-summary/`` and
``/api/analytics/viz/postcode-ticket-records/`` endpoints. This dataset is
transaction-grained (one row per purchase, with a ticket quantity) — distinct
from the aggregate-cohort ``PostcodeEventInteraction`` model.
"""

from datetime import timedelta

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event
from organisations.models import Location, Organisation

from .models import PostcodeTicketPurchase


def _set_point(loc, lng, lat):
    try:
        from django.contrib.gis.geos import Point

        loc.point = Point(lng, lat, srid=4326)
    except Exception:  # pragma: no cover - CharField fallback when GDAL absent
        loc.point = f"{lng},{lat}"
    loc.save()


class PostcodeTicketPurchaseTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Org A")
        cls.loc_a = Location.objects.create(organisation=cls.org, name="Venue A", postcode="PL1 1AA")
        _set_point(cls.loc_a, -4.14, 50.37)

        now = timezone.now()
        cls.ev_a = Event.objects.create(
            organisation=cls.org, title="At A", start_datetime=now + timedelta(days=10), location=cls.loc_a
        )

        # PL1 cohort: 3 orders of 1, 2, 4 tickets = 7 tickets / 3 orders.
        for qty in (1, 2, 4):
            PostcodeTicketPurchase.objects.create(
                organisation=cls.org,
                postcode="PL1 1AA",
                area="City Centre",
                event=cls.ev_a,
                location=cls.loc_a,
                ticket_quantity=qty,
                purchase_date=cls.ev_a.start_datetime.date() - timedelta(days=5),
            )
        # PL2 cohort: 1 order of 6 tickets (group booking).
        PostcodeTicketPurchase.objects.create(
            organisation=cls.org,
            postcode="PL2 2AA",
            area="North",
            event=cls.ev_a,
            location=cls.loc_a,
            ticket_quantity=6,
            purchase_date=cls.ev_a.start_datetime.date() - timedelta(days=1),
        )

    def setUp(self):
        self.client = APIClient()

    # ── upload ──

    def test_upload_requires_token(self):
        r = self.client.post(
            "/api/upload/postcode-tickets/",
            data=[
                {
                    "postcode": "PL4 0AB",
                    "event": self.ev_a.pk,
                    "ticket_quantity": 2,
                    "purchase_date": "2024-01-01",
                }
            ],
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_upload_derives_org_and_location_from_event(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-tickets/",
            data=[
                {
                    "postcode": "PL4 0AB",
                    "event": self.ev_a.pk,
                    "ticket_quantity": 3,
                    "purchase_date": "2024-01-01",
                }
            ],
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data["created"], 1)

        rec = PostcodeTicketPurchase.objects.get(postcode="PL4 0AB")
        self.assertEqual(rec.organisation_id, self.org.pk)
        self.assertEqual(rec.location_id, self.loc_a.pk)
        self.assertEqual(rec.ticket_quantity, 3)
        self.assertEqual(rec.purchase_date.isoformat(), "2024-01-01")

    def test_upload_rejects_missing_event(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-tickets/",
            data=[{"postcode": "PL4 0AB", "ticket_quantity": 2, "purchase_date": "2024-01-01"}],
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_upload_rejects_nonpositive_quantity(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-tickets/",
            data=[
                {
                    "postcode": "PL4 0AB",
                    "event": self.ev_a.pk,
                    "ticket_quantity": 0,
                    "purchase_date": "2024-01-01",
                }
            ],
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    def test_upload_rejects_missing_purchase_date(self):
        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        r = self.client.post(
            "/api/upload/postcode-tickets/",
            data=[{"postcode": "PL4 0AB", "event": self.ev_a.pk, "ticket_quantity": 2}],
            format="json",
        )
        self.assertEqual(r.status_code, 400)

    # ── postcode-ticket-districts ──

    def test_districts_totals(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-districts/")
        body = r.json()
        by_code = {d["code"]: d for d in body["districts"]}
        self.assertEqual(by_code["PL1"]["total_tickets"], 7)
        self.assertEqual(by_code["PL1"]["order_count"], 3)
        self.assertAlmostEqual(by_code["PL1"]["avg_party_size"], 7 / 3, places=2)
        self.assertEqual(by_code["PL2"]["total_tickets"], 6)
        self.assertEqual(by_code["PL2"]["order_count"], 1)

    def test_districts_org_breakdown(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-districts/?district=PL1")
        body = r.json()
        self.assertEqual(body["district"], "PL1")
        self.assertEqual(len(body["orgs"]), 1)
        self.assertEqual(body["orgs"][0]["total_tickets"], 7)
        self.assertEqual(body["orgs"][0]["order_count"], 3)

    # ── postcode-ticket-summary ──

    def test_summary_kpis(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-summary/")
        body = r.json()
        self.assertEqual(body["total_tickets"], 13)
        self.assertEqual(body["total_orders"], 4)
        self.assertAlmostEqual(body["avg_party_size"], 13 / 4, places=2)

    def test_summary_party_size_distribution(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-summary/")
        buckets = {b["tickets"]: b["orders"] for b in r.json()["party_size_distribution"]}
        self.assertEqual(buckets["1"], 1)
        self.assertEqual(buckets["2"], 1)
        self.assertEqual(buckets["3"], 0)
        self.assertEqual(buckets["4"], 1)
        self.assertEqual(buckets["5+"], 1)  # the 6-ticket group booking

    def test_summary_top_postcodes(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-summary/")
        top = {p["code"]: p["total_tickets"] for p in r.json()["top_postcodes"]}
        self.assertEqual(top["PL1"], 7)
        self.assertEqual(top["PL2"], 6)

    # ── postcode-ticket-records ──

    def test_records_shape_and_limit(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-records/?limit=2")
        body = r.json()
        self.assertEqual(body["limit"], 2)
        self.assertEqual(len(body["results"]), 2)
        row = body["results"][0]
        for key in (
            "id",
            "postcode",
            "area",
            "organisation",
            "event_title",
            "ticket_quantity",
            "purchase_date",
        ):
            self.assertIn(key, row)

    def test_records_total_count(self):
        r = self.client.get("/api/analytics/viz/postcode-ticket-records/")
        self.assertEqual(r.json()["count"], 4)

    # ── filters ──

    def test_org_filter_scopes_results(self):
        other_org = Organisation.objects.create(name="Org B")
        r = self.client.get(f"/api/analytics/viz/postcode-ticket-summary/?org={other_org.pk}")
        body = r.json()
        self.assertEqual(body["total_tickets"], 0)
        self.assertEqual(body["total_orders"], 0)
