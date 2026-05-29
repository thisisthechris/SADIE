"""Tests for Phase 4 ImportedEvent review queue API."""

from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from events.models import Event
from organisations.models import Organisation
from scraping.models import ImportedEvent, ScrapeRun, ScrapeSource


class ImportedEventAPITest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user("admin", password="x", is_staff=True)
        cls.user = User.objects.create_user("user", password="x")
        cls.org = Organisation.objects.create(name="Acme Arts")
        cls.source = ScrapeSource.objects.create(
            name="TestSrc",
            base_url="https://example.com",
            scraper_task_name="scraping.tasks.noop",
        )
        cls.scrape_run = ScrapeRun.objects.create(source=cls.source)

    def _make(self, **kw):
        defaults = dict(
            source=self.source,
            scrape_run=self.scrape_run,
            external_id=f"x-{ImportedEvent.objects.count()}",
            title="Sample",
            start_datetime=timezone.now() + timedelta(days=2),
            matched_organisation=self.org,
        )
        defaults.update(kw)
        return ImportedEvent.objects.create(**defaults)

    def test_requires_auth(self):
        self._make()
        r = self.client.get("/api/imports/")
        self.assertIn(r.status_code, (401, 403))

    def test_user_can_list(self):
        self._make()
        self.client.login(username="user", password="x")
        r = self.client.get("/api/imports/")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.json()["count"], 1)

    def test_user_cannot_bulk_action(self):
        ie = self._make()
        self.client.login(username="user", password="x")
        r = self.client.post(
            "/api/imports/bulk-action/",
            {"ids": [ie.id], "action": "approve"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 403)

    def test_staff_bulk_approve(self):
        ie1 = self._make()
        ie2 = self._make()
        self.client.login(username="admin", password="x")
        r = self.client.post(
            "/api/imports/bulk-action/",
            {"ids": [ie1.id, ie2.id], "action": "approve"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        ie1.refresh_from_db()
        ie2.refresh_from_db()
        self.assertEqual(ie1.status, "approved")
        self.assertEqual(ie2.status, "approved")
        self.assertEqual(ie1.reviewed_by_id, self.staff.id)

    def test_staff_bulk_import_creates_event(self):
        ie = self._make(title="A scraped event", description="Hello")
        self.client.login(username="admin", password="x")
        before = Event.objects.count()
        r = self.client.post(
            "/api/imports/bulk-action/",
            {"ids": [ie.id], "action": "import"},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Event.objects.count(), before + 1)
        ie.refresh_from_db()
        self.assertEqual(ie.status, "imported")
        self.assertIsNotNone(ie.matched_event_id)

    def test_counts_endpoint(self):
        self._make(status="pending")
        self._make(status="approved")
        self.client.login(username="user", password="x")
        r = self.client.get("/api/imports/counts/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertGreaterEqual(d.get("pending", 0), 1)
        self.assertGreaterEqual(d.get("approved", 0), 1)
        self.assertEqual(d.get("rejected", 0), 0)
