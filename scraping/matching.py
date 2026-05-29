"""
Fuzzy matching utilities for mapping imported events to existing entities.
"""

import logging
from difflib import SequenceMatcher

from organisations.models import Location, Organisation

logger = logging.getLogger(__name__)

# Minimum similarity ratio to consider a match
ORGANISATION_MATCH_THRESHOLD = 0.80
LOCATION_MATCH_THRESHOLD = 0.80


def _normalise(text: str) -> str:
    """Lower-case, strip, and collapse whitespace for comparison."""
    return " ".join(text.lower().split())


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _normalise(a), _normalise(b)).ratio()


def match_organisation(venue_name: str) -> Organisation | None:
    """
    Attempt to find an existing Organisation by fuzzy-matching on name.
    Returns the best match above the threshold, or None.
    """
    if not venue_name:
        return None

    best_match = None
    best_ratio = 0.0

    for org in Organisation.objects.all():
        ratio = _similarity(venue_name, org.name)
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = org

    if best_ratio >= ORGANISATION_MATCH_THRESHOLD:
        logger.info("Matched venue '%s' → Organisation '%s' (%.0f%%)", venue_name, best_match.name, best_ratio * 100)
        return best_match

    logger.debug("No organisation match for venue '%s' (best: %.0f%%)", venue_name, best_ratio * 100)
    return None


def match_location(venue_name: str, venue_postcode: str, organisation: Organisation | None = None) -> Location | None:
    """
    Attempt to find an existing Location by:
     1. Exact postcode match (narrowing by organisation if available)
     2. Fuzzy name match within the organisation's locations
    Returns the best match or None.
    """
    if not venue_name and not venue_postcode:
        return None

    qs = Location.objects.all()
    if organisation:
        qs = qs.filter(organisation=organisation)

    # Try exact postcode match first
    if venue_postcode:
        postcode_matches = qs.filter(postcode__iexact=venue_postcode.strip())
        if postcode_matches.count() == 1:
            loc = postcode_matches.first()
            logger.info("Matched location by postcode '%s' → %s", venue_postcode, loc)
            return loc
        # Multiple postcode matches — try narrowing by name
        if postcode_matches.count() > 1 and venue_name:
            for loc in postcode_matches:
                if _similarity(venue_name, loc.name) >= LOCATION_MATCH_THRESHOLD:
                    logger.info("Matched location by postcode+name → %s", loc)
                    return loc

    # Fall back to fuzzy name match
    if venue_name:
        best_match = None
        best_ratio = 0.0
        for loc in qs:
            ratio = _similarity(venue_name, loc.name)
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = loc

        if best_ratio >= LOCATION_MATCH_THRESHOLD:
            logger.info("Matched location by name '%s' → %s (%.0f%%)", venue_name, best_match, best_ratio * 100)
            return best_match

    return None


def match_existing_event(external_id: str, source_id: int):
    """
    Check if an Event with this external_id already exists.
    Returns the Event or None.
    """
    from events.models import Event

    if not external_id:
        return None
    return Event.objects.filter(external_id=external_id).first()
