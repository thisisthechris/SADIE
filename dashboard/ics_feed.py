"""Public ICS calendar feeds for events.

Returns iCalendar (.ics) documents so users can subscribe to SADIE events from
any calendar app (Google, Apple, Outlook, etc.). Past and future events are
both included.

Two endpoints:
- events_ics:        all events (honours dashboard filter query params)
- org_events_ics:    a single organisation's events

Neither view requires authentication so calendar clients can poll on a schedule.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from hashlib import sha1

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_safe
from icalendar import Calendar as ICalendar
from icalendar import Event as ICalEvent

from events.models import Event
from organisations.models import Organisation

from .views import _events_qs, _filter_params

MAX_EVENTS = 2000


def _event_uid(ev: Event, host: str) -> str:
    if ev.external_id:
        local = f"{ev.id}-{ev.external_id}"
    else:
        basis = ev.source_url or f"{ev.title}-{ev.start_datetime.isoformat()}"
        local = f"{ev.id}-{sha1(basis.encode('utf-8')).hexdigest()[:12]}"
    return f"event-{local}@{host}"


def _build_calendar(events, *, name: str, description: str, host: str) -> bytes:
    cal = ICalendar()
    cal.add("prodid", "-//SADIE//Arts Analytics//EN")
    cal.add("version", "2.0")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", name)
    cal.add("x-wr-caldesc", description)
    cal.add("x-wr-timezone", "Europe/London")

    now = datetime.now(UTC)

    for ev in events:
        ical_event = ICalEvent()
        ical_event.add("uid", _event_uid(ev, host))
        ical_event.add("summary", ev.title)

        start = ev.start_datetime
        end = ev.end_datetime or (start + timedelta(hours=2))
        ical_event.add("dtstart", start)
        ical_event.add("dtend", end)
        ical_event.add("dtstamp", now)

        desc_parts = [f"Organisation: {ev.organisation.name}"]
        if ev.description:
            desc_parts.append(ev.description)
        if ev.source_url:
            desc_parts.append(f"Source: {ev.source_url}")
        ical_event.add("description", "\n\n".join(desc_parts))

        link = ev.url or ev.source_url
        if link:
            ical_event.add("url", link)

        if ev.location:
            loc_bits = [ev.location.name]
            if ev.location.address:
                loc_bits.append(ev.location.address)
            if ev.location.postcode:
                loc_bits.append(ev.location.postcode)
            ical_event.add("location", ", ".join(b for b in loc_bits if b))

        cats = [c.name for c in ev.categories.all()]
        if cats:
            ical_event.add("categories", cats)

        cal.add_component(ical_event)

    return cal.to_ical()


def _ics_response(body: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(body, content_type="text/calendar; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@require_safe
@cache_control(public=True, max_age=600)
def events_ics(request) -> HttpResponse:
    """Return all (filtered) events as an iCalendar feed."""
    p = _filter_params(request)
    events = (
        _events_qs(p)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("start_datetime")[:MAX_EVENTS]
    )
    body = _build_calendar(
        events,
        name="SADIE Events",
        description="Arts and culture events aggregated by SADIE",
        host=request.get_host(),
    )
    return _ics_response(body, "sadie-events.ics")


@require_safe
@cache_control(public=True, max_age=600)
def org_events_ics(request, slug: str) -> HttpResponse:
    """Return all events for a single organisation as an iCalendar feed."""
    org = get_object_or_404(Organisation, slug=slug)
    events = (
        Event.objects.filter(organisation=org)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("start_datetime")[:MAX_EVENTS]
    )
    body = _build_calendar(
        events,
        name=f"SADIE – {org.name}",
        description=f"Events from {org.name}",
        host=request.get_host(),
    )
    return _ics_response(body, f"sadie-{slug}.ics")


def webcal_url(request, path: str) -> str:
    """Convert an absolute http(s):// URL to webcal:// for one-click subscribe."""
    abs_url = request.build_absolute_uri(path)
    if abs_url.startswith("https://"):
        return "webcal://" + abs_url[len("https://") :]
    if abs_url.startswith("http://"):
        return "webcal://" + abs_url[len("http://") :]
    return abs_url


def calendar_subscribe_urls(request) -> dict:
    """Helper for templates: returns absolute https + webcal URLs for the global feed,
    preserving the current request's query string so filters carry through."""
    base = reverse("dashboard-events-ics")
    qs = request.GET.urlencode()
    path = f"{base}?{qs}" if qs else base
    return {
        "ics_url": request.build_absolute_uri(path),
        "webcal_url": webcal_url(request, path),
    }
