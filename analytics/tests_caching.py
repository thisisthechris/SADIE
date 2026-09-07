"""Tests for analytics/caching.py — the response cache decorator + invalidation helper."""

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event
from organisations.models import Organisation

from .caching import invalidate_stats_cache


@override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
class CachedResponseTest(TestCase):
    def setUp(self):
        cache.clear()
        self.c = APIClient()
        self.org = Organisation.objects.create(name="Cache Test Org")
        Event.objects.create(organisation=self.org, title="Show", start_datetime=timezone.now())

    def test_second_request_is_served_from_cache(self):
        r1 = self.c.get("/api/analytics/stats/summary/")
        self.assertEqual(r1.json()["event_count"], 1)

        # Create a second event directly — a live (uncached) request would
        # now report 2, so an unchanged count on the next request proves the
        # cache served the stale response rather than recomputing.
        Event.objects.create(organisation=self.org, title="Another Show", start_datetime=timezone.now())
        r2 = self.c.get("/api/analytics/stats/summary/")
        self.assertEqual(r2.json()["event_count"], 1)

    def test_different_query_params_are_cached_separately(self):
        other_org = Organisation.objects.create(name="Other Org")
        r_all = self.c.get("/api/analytics/stats/summary/")
        r_scoped = self.c.get(f"/api/analytics/stats/summary/?org={other_org.id}")
        self.assertEqual(r_all.json()["event_count"], 1)
        self.assertEqual(r_scoped.json()["event_count"], 0)

    def test_invalidate_stats_cache_clears_previous_responses(self):
        r1 = self.c.get("/api/analytics/stats/summary/")
        self.assertEqual(r1.json()["event_count"], 1)

        Event.objects.create(organisation=self.org, title="Another Show", start_datetime=timezone.now())
        invalidate_stats_cache()

        r2 = self.c.get("/api/analytics/stats/summary/")
        self.assertEqual(r2.json()["event_count"], 2)
