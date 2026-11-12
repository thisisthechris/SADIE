"""Browser upload API: batch lifecycle, permissions, PII backstop, undo, and data calendar."""

from datetime import date
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from analytics.models import PostcodeTicketPurchase, UserHashInteraction
from organisations.models import Organisation

from .hashing import client_hash, server_hash
from .models import UploadBatch

FINGERPRINT = "a" * 64


def row(**overrides):
    base = {
        "client_hash": client_hash("jane@example.com"),
        "postcode_sector": "PL4 5",
        "event_title": "Evening Concert",
        "event_date": "2026-11-03",
        "purchase_date": "2026-10-20",
        "ticket_quantity": 2,
        "attended_count": 2,
        "ticket_price": "12.50",
        "venue_name": "Main Hall",
        "has_ticket_data": True,
    }
    base.update(overrides)
    return base


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.dummy.DummyCache"}})
@mock.patch("imports.upload_views.rebuild_journey_flows")
class UploadApiTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Theatre Royal Plymouth", is_partner=True)
        cls.other = Organisation.objects.create(name="Other Org", is_partner=True)
        cls.member = User.objects.create_user("member", password="pw")
        cls.org.members.add(cls.member)
        cls.outsider = User.objects.create_user("outsider", password="pw")
        cls.staff = User.objects.create_user("staff", password="pw", is_staff=True)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.member)

    def _create(self, org=None, **extra):
        return self.client.post(
            "/api/uploads/",
            {
                "organisation": (org or self.org).pk,
                "source_format": "Eventbrite",
                "file_fingerprint": FINGERPRINT,
                **extra,
            },
            format="json",
        )

    def _upload(self, rows):
        batch_id = self._create(force=True).json()["id"]
        r = self.client.post(f"/api/uploads/{batch_id}/rows/", {"rows": rows}, format="json")
        return batch_id, r

    def test_full_lifecycle_stores_server_hash_only(self, _rebuild):
        batch_id, r = self._upload([row(), row(client_hash=client_hash("bob@example.com"), attended_count=0)])
        self.assertEqual(r.status_code, 200, r.content)
        done = self.client.post(f"/api/uploads/{batch_id}/complete/").json()

        self.assertEqual(done["status"], "complete")
        self.assertEqual((done["row_count"], done["interaction_count"]), (2, 1))
        self.assertEqual((done["date_from"], done["date_to"]), ("2026-11-03", "2026-11-03"))
        stored = UserHashInteraction.objects.get(upload_batch_id=batch_id)
        self.assertEqual(stored.user_hash, server_hash(client_hash("jane@example.com")))
        self.assertEqual(stored.organisation, self.org)
        self.assertEqual(PostcodeTicketPurchase.objects.filter(upload_batch_id=batch_id).count(), 2)
        _rebuild.assert_called_once()

    def test_members_cannot_upload_for_other_orgs(self, _rebuild):
        self.assertEqual(self._create(org=self.other).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self._create(org=self.other).status_code, 201)

    def test_other_users_cannot_touch_a_batch(self, _rebuild):
        batch_id = self._create().json()["id"]
        self.client.force_authenticate(self.outsider)
        r = self.client.post(f"/api/uploads/{batch_id}/rows/", {"rows": [row()]}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_duplicate_file_needs_force(self, _rebuild):
        self.assertEqual(self._create().status_code, 201)
        dup = self._create()
        self.assertEqual(dup.status_code, 409)
        self.assertIn("duplicate_of", dup.json())
        self.assertEqual(self._create(force=True).status_code, 201)

    def test_rejects_personal_data(self, _rebuild):
        cases = [
            row(client_hash="jane@example.com"),
            row(postcode_sector="PL4 5AB"),
            row(event_title="Contact jane@example.com"),
            row(event_title="Call 07700 900123"),
            row(venue_name="Flat 2, PL1 1AA"),
            {**row(), "email": "jane@example.com"},
            {**row(), "name": "Jane Doe"},
        ]
        for bad in cases:
            with self.subTest(bad=bad):
                _batch_id, r = self._upload([bad])
                self.assertEqual(r.status_code, 400)
                self.assertNotIn("jane@example.com", r.content.decode())
        self.assertEqual(UserHashInteraction.objects.count(), 0)

    def test_file_label_with_personal_data_is_dropped(self, _rebuild):
        r = self._create(file_label="jane@example.com bookings.csv")
        self.assertEqual(r.json()["file_label"], "")

    def test_undo_removes_rows(self, _rebuild):
        batch_id, _ = self._upload([row()])
        self.client.post(f"/api/uploads/{batch_id}/complete/")
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.post(f"/api/uploads/{batch_id}/undo/").status_code, 404)
        self.client.force_authenticate(self.member)
        r = self.client.post(f"/api/uploads/{batch_id}/undo/")
        self.assertEqual(r.json()["status"], "undone")
        self.assertFalse(UserHashInteraction.objects.filter(upload_batch_id=batch_id).exists())
        self.assertFalse(PostcodeTicketPurchase.objects.filter(upload_batch_id=batch_id).exists())
        # An undone file can be uploaded again without forcing.
        self.assertEqual(self._create().status_code, 201)

    def test_chunk_limit(self, _rebuild):
        _batch_id, r = self._upload([row()] * 2001)
        self.assertEqual(r.status_code, 400)

    def test_list_and_organisations_are_scoped(self, _rebuild):
        self._create()
        self.assertEqual(len(self.client.get("/api/uploads/").json()["results"]), 1)
        orgs = self.client.get("/api/uploads/organisations/").json()["results"]
        self.assertEqual([o["name"] for o in orgs], ["Theatre Royal Plymouth"])
        self.client.force_authenticate(self.outsider)
        self.assertEqual(self.client.get("/api/uploads/").json()["results"], [])


@mock.patch("analytics.calendar_views.last_complete_week", return_value=(date(2026, 11, 2), date(2026, 11, 8)))
class DataCalendarTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org = Organisation.objects.create(name="Org A", is_partner=True)
        cls.member = User.objects.create_user("m", password="pw")
        cls.org.members.add(cls.member)
        cls.staff = User.objects.create_user("s", password="pw", is_staff=True)
        for d in (date(2026, 11, 3), date(2026, 10, 21)):
            UserHashInteraction.objects.create(
                user_hash=d.isoformat().ljust(64, "0"),
                interaction_type="event",
                organisation=cls.org,
                interaction_date=d,
            )
        UploadBatch.objects.create(
            organisation=cls.org,
            source_format="Eventbrite",
            file_fingerprint=FINGERPRINT,
            status=UploadBatch.Status.COMPLETE,
            date_from=date(2026, 10, 21),
            date_to=date(2026, 11, 3),
        )

    def setUp(self):
        self.client = APIClient()

    def test_weeks_and_gaps(self, _week):
        self.client.force_authenticate(self.member)
        d = self.client.get("/api/analytics/data-calendar/", {"org": self.org.pk, "weeks": 4}).json()
        weeks = [(w["week_start"], w["interactions"], w["gap"], w["uploads"]) for w in d["calendar"]]
        self.assertEqual(
            weeks,
            [
                ("2026-10-12", 0, True, 0),
                ("2026-10-19", 1, False, 1),
                ("2026-10-26", 0, True, 1),
                ("2026-11-02", 1, False, 1),
            ],
        )
        self.assertEqual((d["weeks_with_data"], d["gap_weeks"], d["last_week_with_data"]), (2, 2, "2026-11-02"))

    def test_overview_is_staff_only(self, _week):
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/analytics/data-calendar/").status_code, 403)
        self.client.force_authenticate(self.staff)
        d = self.client.get("/api/analytics/data-calendar/", {"weeks": 4}).json()
        self.assertEqual([r["organisation"]["name"] for r in d["results"]], ["Org A"])

    def test_members_only_see_their_org(self, _week):
        other = Organisation.objects.create(name="Org B", is_partner=True)
        self.client.force_authenticate(self.member)
        self.assertEqual(self.client.get("/api/analytics/data-calendar/", {"org": other.pk}).status_code, 404)
