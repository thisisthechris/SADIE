"""
Assign real-world coordinates to partner venue Locations.

Partner CSV exports never carry venue addresses, so imported Locations
(both the venue names parsed from the Theatre box-office export, and the
per-organisation "Primary Venue" fallback created by imports/services.py
when a source has no venue column at all) end up with no `point` set —
which is why the Events/Venues maps render empty.

This command assigns each organisation's known public postcode (the real
address of that Plymouth cultural venue), geocodes it via the existing
postcodes.io integration (analytics.geocoding, with its outcode-centroid
fallback), and applies a small deterministic jitter per Location so venues
belonging to the same organisation don't all stack on exactly one pin.
"""

import math
from hashlib import sha256

from django.core.management.base import BaseCommand

from analytics.geocoding import geocode_postcode_bulk, normalize_postcode
from organisations.models import _HAS_GIS, Location

try:
    from django.contrib.gis.geos import Point
except Exception:
    Point = None

# Real, public postcodes for each partner organisation's primary venue.
ORG_POSTCODES = {
    "The Box": "PL4 8AX",  # The Box, Tavistock Place
    "Ocean Conservation Trust": "PL4 0LF",  # National Marine Aquarium, Rope Walk, Coxside
    "Plymouth Culture": "PL1 2EQ",  # Plymouth city centre
    "Real Ideas Organisation": "PL1 3RP",  # Royal William Yard
    "Theatre Royal Plymouth": "PL1 2TR",  # Royal Parade
    "Arts University Plymouth": "PL4 8AT",  # Tavistock Place
}
DEFAULT_POSTCODE = "PL1 2EQ"  # Plymouth city centre fallback for unrecognised orgs

JITTER_RADIUS_METERS = 250


def _jitter(lat: float, lng: float, seed: str) -> tuple[float, float]:
    """Deterministic offset (0-250m) so co-located venues don't overlap exactly."""
    h = int(sha256(seed.encode()).hexdigest(), 16)
    angle = (h % 360) * math.pi / 180
    radius = JITTER_RADIUS_METERS * ((h // 360) % 1000) / 1000
    dlat = (radius * math.cos(angle)) / 111_000
    dlng = (radius * math.sin(angle)) / (111_000 * math.cos(math.radians(lat)))
    return lat + dlat, lng + dlng


class Command(BaseCommand):
    help = "Geocode partner venue Locations missing coordinates, using each organisation's known postcode."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Re-geocode locations that already have a point (default: only fill in missing ones).",
        )

    def handle(self, *args, **options):
        force = options["force"]
        locations = Location.objects.select_related("organisation").all()
        if not force:
            # The `point` field is a real PostGIS PointField (NULL when unset) when
            # GIS/GDAL is available, but falls back to a plain CharField (empty
            # string when unset) otherwise (see organisations.models._point_field).
            # Filter for whichever "missing" looks like on this backend.
            locations = locations.filter(point__isnull=True) if _HAS_GIS else locations.filter(point="")

        if not locations.exists():
            self.stdout.write(self.style.SUCCESS("All locations already have coordinates."))
            return

        org_names = set(locations.values_list("organisation__name", flat=True))
        postcodes = {ORG_POSTCODES.get(name, DEFAULT_POSTCODE) for name in org_names}
        self.stdout.write(f"Geocoding {len(postcodes)} organisation postcode(s)...")
        geocodes = geocode_postcode_bulk(list(postcodes))

        updated = 0
        skipped = 0
        for loc in locations:
            postcode = ORG_POSTCODES.get(loc.organisation.name, DEFAULT_POSTCODE)
            coords = geocodes.get(normalize_postcode(postcode))
            if not coords:
                self.stdout.write(self.style.WARNING(f"No geocode available for {postcode} ({loc}); skipping"))
                skipped += 1
                continue
            lat, lng = coords
            jlat, jlng = _jitter(lat, lng, seed=f"{loc.pk}:{loc.name}")
            loc.point = Point(jlng, jlat, srid=4326) if (_HAS_GIS and Point is not None) else f"{jlng},{jlat}"
            if not loc.postcode:
                loc.postcode = postcode
            loc.save(update_fields=["point", "postcode"])
            updated += 1

        self.stdout.write(self.style.SUCCESS(f"Geocoded {updated} location(s)."))
        if skipped:
            self.stdout.write(self.style.WARNING(f"Skipped {skipped} location(s) (no geocode available)."))
