"""Tests for Phase 4 recommendations endpoints."""

from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from events.models import Event
from organisations.models import Organisation


class RecommendationsAPITest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("u", password="x")
        cls.org = Organisation.objects.create(name="Org A")
        cls.org2 = Organisation.objects.create(name="Org B")
        # Two events from same org for the fallback path
        now = timezone.now()
        cls.e1 = Event.objects.create(
            organisation=cls.org,
            title="Concert one",
            start_datetime=now + timedelta(days=3),
        )
        cls.e2 = Event.objects.create(
            organisation=cls.org,
            title="Concert two",
            start_datetime=now + timedelta(days=10),
        )
        cls.other = Event.objects.create(
            organisation=cls.org2,
            title="Different",
            start_datetime=now + timedelta(days=4),
        )

    def setUp(self):
        self.client.login(username="u", password="x")

    def test_similar_uses_fallback_when_no_embedding(self):
        r = self.client.get(f"/api/analytics/recommendations/similar/{self.e1.id}/?limit=5")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["method"], "same_organisation")
        ids = [row["id"] for row in body["results"]]
        self.assertIn(self.e2.id, ids)
        self.assertNotIn(self.e1.id, ids)

    def test_similar_404(self):
        r = self.client.get("/api/analytics/recommendations/similar/9999999/")
        self.assertEqual(r.status_code, 404)

    def test_near_unknown_postcode(self):
        r = self.client.get("/api/analytics/recommendations/near/?postcode=ZZ99")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["results"], [])
        self.assertIn("PL1", body["available_districts"])

    def test_near_known_postcode_returns_list(self):
        r = self.client.get("/api/analytics/recommendations/near/?postcode=PL4&km=5")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["postcode"], "PL4")
        self.assertEqual(body["km"], 5.0)
        self.assertIsInstance(body["results"], list)
