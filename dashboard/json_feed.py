"""Public JSON feeds for events.

Returns JSON documents for programmatic consumption. Complements ICS (calendar)
and RSS feeds. Simpler than the full /api/events/ DRF endpoint.

Two endpoints:
- events_json:       all events (honours dashboard filter query params)
- org_events_json:   a single organisation's events

Neither view requires authentication so API clients can poll on a schedule.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

# Python 3.11+ has datetime.UTC, Python 3.10 uses timezone.utc
try:
    from datetime import UTC
except ImportError:
    UTC = timezone.utc  # noqa: UP017

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_safe

from events.models import Event
from organisations.models import Organisation

from .views import _events_qs, _filter_params

MAX_EVENTS = 2000


def _serialize_event(ev: Event, host: str) -> dict:
    """Convert an Event model to a JSON-serializable dictionary."""
    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description,
        "start_datetime": ev.start_datetime.isoformat(),
        "end_datetime": ev.end_datetime.isoformat() if ev.end_datetime else None,
        "organisation": {
            "id": ev.organisation.id,
            "name": ev.organisation.name,
            "slug": ev.organisation.slug,
        },
        "location": (
            {
                "id": ev.location.id,
                "name": ev.location.name,
                "address": ev.location.address,
                "postcode": ev.location.postcode,
            }
            if ev.location
            else None
        ),
        "categories": [{"id": c.id, "name": c.name, "slug": c.slug} for c in ev.categories.all()],
        "url": ev.url,
        "source_url": ev.source_url,
        "image_url": ev.image_url,
        "created_at": ev.created_at.isoformat(),
        "updated_at": ev.updated_at.isoformat(),
    }


def _build_json(events, *, host: str) -> str:
    """Build a JSON feed from a queryset of events."""
    serialized = [_serialize_event(ev, host) for ev in events]
    return json.dumps(
        {
            "generated_at": datetime.now(UTC).isoformat(),
            "count": len(serialized),
            "events": serialized,
        },
        indent=2,
    )


def _json_response(body: str, filename: str) -> HttpResponse:
    response = HttpResponse(body, content_type="application/json; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@require_safe
@cache_control(public=True, max_age=600)
def events_json(request) -> HttpResponse:
    """Return all (filtered) events as a JSON array."""
    p = _filter_params(request)
    events = (
        _events_qs(p)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("start_datetime")[:MAX_EVENTS]
    )

    body = _build_json(events, host=request.get_host())
    return _json_response(body, "sadie-events.json")


@require_safe
@cache_control(public=True, max_age=600)
def org_events_json(request, slug: str) -> HttpResponse:
    """Return all events for a single organisation as a JSON array."""
    org = get_object_or_404(Organisation, slug=slug)
    events = (
        Event.objects.filter(organisation=org)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("start_datetime")[:MAX_EVENTS]
    )

    body = _build_json(events, host=request.get_host())
    return _json_response(body, f"sadie-{slug}.json")
