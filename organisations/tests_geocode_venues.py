"""
Tests for the geocode_venues management command (organisations app).

Mocks analytics.geocoding.geocode_postcode_bulk so these tests never make a
live network call to postcodes.io — see the command's module docstring for
why every partner venue Location needs a geocoded point in the first place.
"""

from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase

from organisations.management.commands.geocode_venues import DEFAULT_POSTCODE, ORG_POSTCODES, _jitter
from organisations.models import _HAS_GIS, Location, Organisation

try:
    from django.contrib.gis.geos import Point
except Exception:
    Point = None


def _make_point(lng: float, lat: float):
    """A pre-existing point value valid for either the PointField or CharField backend."""
    return Point(lng, lat, srid=4326) if (_HAS_GIS and Point is not None) else f"{lng},{lat}"


def _fake_geocode_postcode_bulk(postcodes, skip_cached=True):
    """Deterministic stand-in for the real postcodes.io-backed function."""
    base = {
        "PL4 8AX": (50.3741, -4.1370),
        "PL4 0LF": (50.3667, -4.1310),
        "PL1 2EQ": (50.3736, -4.1420),
        "PL1 3RP": (50.3619, -4.1641),
        "PL1 2TR": (50.3699, -4.1451),
        "PL4 8AT": (50.3734, -4.1374),
    }
    return {pc: base.get(pc) for pc in postcodes}


@patch(
    "organisations.management.commands.geocode_venues.geocode_postcode_bulk",
    side_effect=_fake_geocode_postcode_bulk,
)
class GeocodeVenuesCommandTest(TestCase):
    def setUp(self):
        self.theatre = Organisation.objects.create(name="Theatre Royal Plymouth", is_partner=True)
        self.unknown_org = Organisation.objects.create(name="Some Unmapped Org", is_partner=True)

    def test_fills_in_missing_points_only(self, mock_geocode):
        loc_missing = Location.objects.create(organisation=self.theatre, name="Venue A")
        original_point = _make_point(-4.16, 50.36)
        loc_existing = Location.objects.create(organisation=self.theatre, name="Venue B", point=original_point)

        call_command("geocode_venues")

        loc_missing.refresh_from_db()
        loc_existing.refresh_from_db()
        self.assertTrue(loc_missing.point)
        # Untouched — already had a point and --force was not passed.
        self.assertEqual(str(loc_existing.point), str(original_point))
        mock_geocode.assert_called_once()

    def test_force_regeocodes_existing_points(self, mock_geocode):
        original_point = _make_point(-4.16, 50.36)
        loc = Location.objects.create(organisation=self.theatre, name="Venue B", point=original_point)

        call_command("geocode_venues", force=True)

        loc.refresh_from_db()
        self.assertNotEqual(str(loc.point), str(original_point))

    def test_unrecognised_org_falls_back_to_default_postcode(self, mock_geocode):
        Location.objects.create(organisation=self.unknown_org, name="Mystery Venue")

        call_command("geocode_venues")

        called_postcodes = set(mock_geocode.call_args[0][0])
        self.assertIn(DEFAULT_POSTCODE, called_postcodes)

    def test_sets_postcode_field_when_blank(self, mock_geocode):
        loc = Location.objects.create(organisation=self.theatre, name="Venue A")
        call_command("geocode_venues")
        loc.refresh_from_db()
        self.assertEqual(loc.postcode, ORG_POSTCODES["Theatre Royal Plymouth"])

    def test_does_not_overwrite_existing_postcode(self, mock_geocode):
        loc = Location.objects.create(organisation=self.theatre, name="Venue A", postcode="PL9 9ZZ")
        call_command("geocode_venues")
        loc.refresh_from_db()
        self.assertEqual(loc.postcode, "PL9 9ZZ")

    def test_no_locations_needing_geocoding_is_a_noop(self, mock_geocode):
        Location.objects.create(organisation=self.theatre, name="Venue A", point=_make_point(-4.16, 50.36))
        call_command("geocode_venues")
        mock_geocode.assert_not_called()

    def test_skips_location_when_no_geocode_available(self, mock_geocode):
        mock_geocode.side_effect = lambda postcodes, skip_cached=True: {pc: None for pc in postcodes}
        loc = Location.objects.create(organisation=self.theatre, name="Venue A")
        call_command("geocode_venues")
        loc.refresh_from_db()
        self.assertFalse(loc.point)


class JitterTest(TestCase):
    def test_deterministic_for_same_seed(self):
        a = _jitter(50.37, -4.14, seed="1:Venue A")
        b = _jitter(50.37, -4.14, seed="1:Venue A")
        self.assertEqual(a, b)

    def test_different_for_different_seed(self):
        a = _jitter(50.37, -4.14, seed="1:Venue A")
        b = _jitter(50.37, -4.14, seed="2:Venue B")
        self.assertNotEqual(a, b)

    def test_offset_within_expected_radius(self):
        lat, lng = 50.37, -4.14
        jlat, jlng = _jitter(lat, lng, seed="seed")
        # ~250m max radius -> well under 0.01 degrees in both directions at this latitude.
        self.assertLess(abs(jlat - lat), 0.01)
        self.assertLess(abs(jlng - lng), 0.01)
