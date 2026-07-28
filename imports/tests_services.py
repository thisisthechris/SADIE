"""
Tests for imports/services.py — specifically the default-venue fallback in
ImportContext.get_location(). Most partner CSV formats have no venue column
at all, so bookings from those sources must resolve to a per-organisation
"Primary Venue" Location rather than leaving Event.location null (see the
docstring on get_location for the full rationale).
"""

from django.test import TestCase

from organisations.models import Location, Organisation

from .services import ImportContext


class DefaultLocationFallbackTest(TestCase):
    def setUp(self):
        self.ctx = ImportContext()
        self.org = Organisation.objects.create(name="Test Partner Org")

    def test_falsy_venue_name_returns_default_location(self):
        for venue_name in (None, ""):
            location = self.ctx.get_location(self.org, venue_name)
            self.assertIsInstance(location, Location)
            self.assertEqual(location.name, "Test Partner Org (Primary Venue)")
            self.assertEqual(location.organisation_id, self.org.pk)

    def test_default_location_is_created_once_and_reused(self):
        first = self.ctx.get_location(self.org, None)
        second = self.ctx.get_location(self.org, "")
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(
            Location.objects.filter(organisation=self.org, name="Test Partner Org (Primary Venue)").count(),
            1,
        )

    def test_default_location_is_get_or_create_safe_across_contexts(self):
        # A second ImportContext (e.g. a re-run of the import command) must
        # reuse the same Location row rather than creating a duplicate.
        first = self.ctx.get_location(self.org, None)
        other_ctx = ImportContext()
        second = other_ctx.get_location(self.org, None)
        self.assertEqual(first.pk, second.pk)

    def test_named_venue_still_creates_its_own_location(self):
        # Theatre-style rows that DO have a venue name must not be routed to
        # the default-location fallback.
        named = self.ctx.get_location(self.org, "University Space")
        self.assertEqual(named.name, "University Space")
        default = self.ctx.get_location(self.org, None)
        self.assertNotEqual(named.pk, default.pk)

    def test_different_orgs_get_separate_default_locations(self):
        other_org = Organisation.objects.create(name="Other Org")
        loc_a = self.ctx.get_location(self.org, None)
        loc_b = self.ctx.get_location(other_org, None)
        self.assertNotEqual(loc_a.pk, loc_b.pk)
        self.assertEqual(loc_a.name, "Test Partner Org (Primary Venue)")
        self.assertEqual(loc_b.name, "Other Org (Primary Venue)")
