"""
Service layer for promoting approved ImportedEvents into the main Event table.
"""
import logging

import requests
from django.contrib.gis.geos import Point
from django.utils import timezone

from events.models import Category, Event
from organisations.models import Location, Organisation

from .models import ImportedEvent

logger = logging.getLogger(__name__)

POSTCODES_IO_URL = "https://api.postcodes.io/postcodes/"


def geocode_postcode(postcode: str) -> tuple[float, float] | None:
    """
    Look up a UK postcode via postcodes.io (free, no API key required).
    Returns (latitude, longitude) or None on failure.
    """
    if not postcode or not postcode.strip():
        return None
    try:
        resp = requests.get(
            POSTCODES_IO_URL + postcode.strip().replace(" ", "%20"),
            timeout=5,
        )
        if resp.status_code != 200:
            logger.debug("postcodes.io returned %s for '%s'", resp.status_code, postcode)
            return None
        data = resp.json()
        if data.get("status") == 200 and data.get("result"):
            lat = data["result"]["latitude"]
            lng = data["result"]["longitude"]
            logger.info("Geocoded '%s' → (%.5f, %.5f)", postcode, lat, lng)
            return (lat, lng)
    except requests.RequestException as exc:
        logger.warning("postcodes.io request failed for '%s': %s", postcode, exc)
    return None


def _get_or_create_organisation(imported_event: ImportedEvent) -> Organisation:
    """Return matched org or create one from venue_name."""
    if imported_event.matched_organisation:
        return imported_event.matched_organisation

    org, created = Organisation.objects.get_or_create(
        name=imported_event.venue_name or imported_event.source.name,
        defaults={
            "description": f"Auto-created from {imported_event.source.name} import",
        },
    )
    if created:
        logger.info("Created Organisation: %s", org.name)
    return org


def _get_or_create_location(imported_event: ImportedEvent, organisation: Organisation) -> Location | None:
    """Return matched location or create one from venue data."""
    if imported_event.matched_location:
        return imported_event.matched_location

    if not imported_event.venue_name:
        return None

    # Build point from lat/lng if valid (filter the NYC Squarespace default)
    point = None
    if imported_event.venue_lat and imported_event.venue_lng:
        lat, lng = imported_event.venue_lat, imported_event.venue_lng
        # Filter out the Squarespace NYC default (≈40.72, -74.00)
        if not (40.7 < lat < 40.75 and -74.01 < lng < -73.99):
            try:
                point = Point(lng, lat, srid=4326)
            except Exception:
                point = None

    # Geocode from postcode if we still don't have coordinates
    if point is None and imported_event.venue_postcode:
        coords = geocode_postcode(imported_event.venue_postcode)
        if coords:
            try:
                point = Point(coords[1], coords[0], srid=4326)  # Point(lng, lat)
            except Exception:
                point = None

    loc, created = Location.objects.get_or_create(
        organisation=organisation,
        name=imported_event.venue_name,
        defaults={
            "address": imported_event.venue_address,
            "postcode": imported_event.venue_postcode,
            "point": point,
        },
    )
    if created:
        logger.info("Created Location: %s", loc)
    # Backfill coordinates on existing locations that are missing a point
    elif loc.point is None and point is not None:
        loc.point = point
        loc.save(update_fields=["point"])
        logger.info("Backfilled coordinates for Location: %s", loc)
    return loc


def _sync_categories(event: Event, imported_event: ImportedEvent):
    """Add Category objects from categories_raw list."""
    for cat_name in imported_event.categories_raw or []:
        cat_name = cat_name.strip()
        if not cat_name:
            continue
        cat, _ = Category.objects.get_or_create(name=cat_name)
        event.categories.add(cat)


def import_approved_event(imported_event: ImportedEvent) -> Event:
    """
    Promote an approved ImportedEvent into the live Event table.

    If matched_event is set, update that event. Otherwise create a new one.
    Sets the ImportedEvent status to 'imported' on success.
    """
    if imported_event.status != "approved":
        raise ValueError(f"Cannot import event with status '{imported_event.status}' – must be 'approved'.")

    org = _get_or_create_organisation(imported_event)
    location = _get_or_create_location(imported_event, org)

    defaults = {
        "title": imported_event.title,
        "description": imported_event.description,
        "start_datetime": imported_event.start_datetime,
        "end_datetime": imported_event.end_datetime,
        "url": imported_event.source_url,
        "location": location,
        "image_url": imported_event.image_url or "",
        "source_url": imported_event.source_url or "",
        "source_tags": imported_event.tags_raw or [],
    }

    if imported_event.matched_event:
        event = imported_event.matched_event
        for attr, value in defaults.items():
            setattr(event, attr, value)
        event.organisation = org
        event.external_id = imported_event.external_id
        event.save()
        logger.info("Updated existing Event #%s: %s", event.pk, event.title)
    else:
        event = Event.objects.create(
            organisation=org,
            external_id=imported_event.external_id,
            **defaults,
        )
        logger.info("Created new Event #%s: %s", event.pk, event.title)

    _sync_categories(event, imported_event)

    imported_event.status = "imported"
    imported_event.matched_event = event
    imported_event.matched_organisation = org
    imported_event.matched_location = location
    imported_event.save()

    return event
