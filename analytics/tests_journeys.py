"""Tests for the journeys analytics summary endpoint."""

from datetime import date, timedelta

from django.contrib.auth.models import User
from django.test import TestCase

from analytics.models import UserHashInteraction
from organisations.models import Organisation


class JourneysSummaryTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user("u", password="x")
        cls.org_a = Organisation.objects.create(name="Org A")
        cls.org_b = Organisation.objects.create(name="Org B")
        today = date.today()
        # Two distinct user hashes against Org A, mixed types
        UserHashInteraction.objects.create(
            user_hash="aaaa1111" * 8,
            interaction_type="event",
            organisation=cls.org_a,
            interaction_date=today,
        )
        UserHashInteraction.objects.create(
            user_hash="bbbb2222" * 8,
            interaction_type="location",
            organisation=cls.org_a,
            interaction_date=today - timedelta(days=10),
        )
        UserHashInteraction.objects.create(
            user_hash="aaaa1111" * 8,
            interaction_type="event",
            organisation=cls.org_b,
            interaction_date=today - timedelta(days=40),
        )

    def test_requires_auth(self):
        r = self.client.get("/api/analytics/journeys/summary/")
        self.assertIn(r.status_code, (401, 403))

    def test_returns_expected_shape(self):
        self.client.login(username="u", password="x")
        r = self.client.get("/api/analytics/journeys/summary/")
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        for key in (
            "filters",
            "totals",
            "monthly",
            "type_breakdown",
            "unique_users_by_org",
            "top_users",
            "cross_tab",
        ):
            self.assertIn(key, body)
        self.assertEqual(body["totals"]["interactions"], 3)
        self.assertEqual(body["totals"]["unique_users"], 2)

        types = {row["interaction_type"]: row["n"] for row in body["type_breakdown"]}
        self.assertEqual(types.get("event"), 2)
        self.assertEqual(types.get("location"), 1)

        org_unique = {row["organisation"]: row["unique_users"] for row in body["unique_users_by_org"]}
        self.assertEqual(org_unique["Org A"], 2)
        self.assertEqual(org_unique["Org B"], 1)

        # Top users should be short hashes (8 chars), not the full 64-char hash.
        for row in body["top_users"]:
            self.assertLessEqual(len(row["user_hash"]), 8)
