"""
Persistence layer for the partner CSV import: resolves/creates Organisation,
Location and Event records, and aggregates NormalizedBooking rows into the
four analytics tables.

No PII ever reaches this module — NormalizedBooking only carries a
pre-computed user_hash (see imports/parsers.py).
"""

from __future__ import annotations

import calendar
from datetime import date

from analytics.geocoding import normalize_postcode
from analytics.models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)
from analytics.queries import district_of
from events.models import Event
from organisations.models import Location, Organisation
from scraping.matching import match_location

from .parsers import ORG_CODE_MAP, NormalizedBooking

_BULK_CREATE_BATCH_SIZE = 500


def _month_bounds(d: date) -> tuple[date, date]:
    last_day = calendar.monthrange(d.year, d.month)[1]
    return date(d.year, d.month, 1), date(d.year, d.month, last_day)


class ImportContext:
    """Per-run cache + in-memory aggregation, flushed to the DB at the end."""

    def __init__(self):
        self._org_cache: dict[str, Organisation] = {}
        self._location_cache: dict[tuple[int, str], Location] = {}
        self._event_cache: dict[tuple[int, str, object], Event] = {}

        # Rows to bulk_create verbatim (one row per booking).
        self.user_hash_interactions: list[UserHashInteraction] = []
        self.ticket_purchases: list[PostcodeTicketPurchase] = []

        # Aggregated cohort counts, keyed by grouping tuple -> running total.
        self._event_interaction_agg: dict[tuple, int] = {}
        self._area_interaction_agg: dict[tuple, int] = {}

        self.orgs_touched: set[str] = set()

    # -- resolution -----------------------------------------------------

    def get_organisation(self, code: str) -> Organisation:
        if code not in self._org_cache:
            name = ORG_CODE_MAP[code]
            org, _created = Organisation.objects.get_or_create(
                name=name,
                defaults={
                    "is_partner": True,
                    "description": "Imported from partner CSV test data.",
                },
            )
            if not org.is_partner:
                org.is_partner = True
                org.save(update_fields=["is_partner"])
            self._org_cache[code] = org
        self.orgs_touched.add(code)
        return self._org_cache[code]

    def get_location(self, org: Organisation, venue_name: str | None) -> Location:
        """
        Resolve (creating if needed) the Location for a booking.

        Most source formats (Eventbrite, Digitickets, Monday.com CRM, both
        Museum exports) have no venue/venue-name column at all — only the
        Theatre box office export does. For those venue-less sources we fall
        back to a single "Primary Venue" Location per organisation so every
        Event still has a location to plot on venue/postcode maps, rather
        than leaving location null.
        """
        if not venue_name:
            return self._get_default_location(org)
        cache_key = (org.pk, venue_name)
        if cache_key not in self._location_cache:
            location = match_location(venue_name, "", org)
            if location is None:
                location = Location.objects.create(organisation=org, name=venue_name)
            self._location_cache[cache_key] = location
        return self._location_cache[cache_key]

    def _get_default_location(self, org: Organisation) -> Location:
        """Get-or-create the fallback Location used when a source has no venue column."""
        cache_key = (org.pk, "__default__")
        if cache_key not in self._location_cache:
            location, _created = Location.objects.get_or_create(
                organisation=org,
                name=f"{org.name} (Primary Venue)",
            )
            self._location_cache[cache_key] = location
        return self._location_cache[cache_key]

    def get_event(self, org: Organisation, title: str, start_datetime, location: Location) -> Event:
        cache_key = (org.pk, title, start_datetime)
        if cache_key not in self._event_cache:
            event, _created = Event.objects.get_or_create(
                organisation=org,
                title=title,
                start_datetime=start_datetime,
                defaults={"location": location},
            )
            self._event_cache[cache_key] = event
        return self._event_cache[cache_key]

    # -- recording --------------------------------------------------------

    def record_booking(self, booking: NormalizedBooking) -> None:
        org = self.get_organisation(booking.org_code)
        location = self.get_location(org, booking.venue_name)
        event = self.get_event(org, booking.event_title, booking.event_datetime, location)

        postcode = normalize_postcode(booking.postcode)
        area = district_of(postcode)
        event_date = booking.event_datetime.date()

        if booking.attended:
            self.user_hash_interactions.append(
                UserHashInteraction(
                    user_hash=booking.user_hash,
                    interaction_type="event",
                    event=event,
                    location=location,
                    organisation=org,
                    interaction_date=event_date,
                )
            )

            event_key = (org.pk, postcode, area, event.pk, location.pk, event_date)
            self._event_interaction_agg[event_key] = (
                self._event_interaction_agg.get(event_key, 0) + booking.attended_count
            )

            period_start, period_end = _month_bounds(event_date)
            area_key = (org.pk, postcode, area, period_start, period_end)
            self._area_interaction_agg[area_key] = self._area_interaction_agg.get(area_key, 0) + booking.attended_count

        if booking.has_ticket_data:
            self.ticket_purchases.append(
                PostcodeTicketPurchase(
                    organisation=org,
                    postcode=postcode,
                    area=area,
                    event=event,
                    location=location,
                    ticket_quantity=booking.ticket_quantity,
                    purchase_date=booking.purchase_datetime.date(),
                )
            )

    # -- flush --------------------------------------------------------------

    def flush(self) -> dict[str, int]:
        """Bulk-create everything accumulated so far. Returns row counts created."""
        UserHashInteraction.objects.bulk_create(self.user_hash_interactions, batch_size=_BULK_CREATE_BATCH_SIZE)
        PostcodeTicketPurchase.objects.bulk_create(self.ticket_purchases, batch_size=_BULK_CREATE_BATCH_SIZE)

        event_interactions = [
            PostcodeEventInteraction(
                organisation_id=org_id,
                postcode=postcode,
                area=area,
                event_id=event_id,
                location_id=location_id,
                interaction_count=count,
                interaction_date=interaction_date,
            )
            for (org_id, postcode, area, event_id, location_id, interaction_date), count in (
                self._event_interaction_agg.items()
            )
        ]
        PostcodeEventInteraction.objects.bulk_create(event_interactions, batch_size=_BULK_CREATE_BATCH_SIZE)

        area_interactions = [
            PostcodeAreaInteraction(
                organisation_id=org_id,
                postcode=postcode,
                area=area,
                interaction_count=count,
                period_start=period_start,
                period_end=period_end,
            )
            for (org_id, postcode, area, period_start, period_end), count in self._area_interaction_agg.items()
        ]
        PostcodeAreaInteraction.objects.bulk_create(area_interactions, batch_size=_BULK_CREATE_BATCH_SIZE)

        return {
            "user_hash_interactions": len(self.user_hash_interactions),
            "ticket_purchases": len(self.ticket_purchases),
            "postcode_event_interactions": len(event_interactions),
            "postcode_area_interactions": len(area_interactions),
            "organisations": len(self._org_cache),
            "events": len(self._event_cache),
        }


def clear_partner_data() -> None:
    """
    Delete all data owned by known partner organisations (Organisation cascades
    to Location/Event; analytics rows are deleted explicitly since they use
    on_delete=CASCADE/SET_NULL on organisation too, but we scope explicitly by
    organisation name to avoid touching unrelated demo data).
    """
    orgs = Organisation.objects.filter(name__in=ORG_CODE_MAP.values())
    org_ids = list(orgs.values_list("id", flat=True))
    if not org_ids:
        return
    UserHashInteraction.objects.filter(organisation_id__in=org_ids).delete()
    PostcodeAreaInteraction.objects.filter(organisation_id__in=org_ids).delete()
    PostcodeEventInteraction.objects.filter(organisation_id__in=org_ids).delete()
    PostcodeTicketPurchase.objects.filter(organisation_id__in=org_ids).delete()
    orgs.delete()  # cascades to Location + Event
