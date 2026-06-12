"""Public RSS feeds for events.

Returns RSS documents so users can subscribe to SADIE events in their
RSS reader of choice. Complements ICS (calendar) and JSON feeds.

Two endpoints:
- events_rss:        all events (honours dashboard filter query params)
- org_events_rss:    a single organisation's events

Neither view requires authentication so RSS clients can poll on a schedule.
"""

from __future__ import annotations

from datetime import datetime, timezone

# Python 3.11+ has datetime.UTC, Python 3.10 uses timezone.utc
try:
    from datetime import UTC
except ImportError:
    UTC = timezone.utc  # noqa: UP017

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_safe
import PyRSS2Gen

from events.models import Event
from organisations.models import Organisation

from .views import _events_qs, _filter_params

MAX_EVENTS = 2000


def _build_rss(events, *, title: str, link: str, description: str) -> str:
    """Build an RSS 2.0 feed from a queryset of events."""
    items = []
    
    for ev in events:
        # Construct event URL (prefer event's own URL, fall back to source_url)
        item_link = ev.url or ev.source_url or link
        
        # Build description with organisation, location, categories
        desc_parts = []
        if ev.organisation:
            desc_parts.append(f"<strong>Organisation:</strong> {ev.organisation.name}")
        if ev.location:
            loc_str = ev.location.name
            if ev.location.address:
                loc_str += f", {ev.location.address}"
            desc_parts.append(f"<strong>Location:</strong> {loc_str}")
        
        cats = [c.name for c in ev.categories.all()]
        if cats:
            desc_parts.append(f"<strong>Categories:</strong> {', '.join(cats)}")
        
        if ev.description:
            desc_parts.append(f"<p>{ev.description}</p>")
        
        if ev.source_url:
            desc_parts.append(f"<small>Source: <a href='{ev.source_url}'>{ev.source_url}</a></small>")
        
        item_desc = "<br/>".join(desc_parts)
        
        # Format datetime for RSS (RFC 822)
        pub_date = ev.created_at or datetime.now(UTC)
        
        items.append(
            PyRSS2Gen.RSSItem(
                title=ev.title,
                link=item_link,
                description=item_desc,
                guid=f"event-{ev.id}@{link}",
                pubDate=pub_date,
                # Optional: add categories
                categories=[PyRSS2Gen.Category(c.name) for c in ev.categories.all()],
            )
        )
    
    rss = PyRSS2Gen.RSS2(
        title=title,
        link=link,
        description=description,
        items=items,
        lastBuildDate=datetime.now(UTC),
        language="en-gb",
    )
    
    return rss.to_xml()


def _rss_response(body: str, filename: str) -> HttpResponse:
    response = HttpResponse(body, content_type="application/rss+xml; charset=utf-8")
    response["Content-Disposition"] = f'inline; filename="{filename}"'
    return response


@require_safe
@cache_control(public=True, max_age=600)
def events_rss(request) -> HttpResponse:
    """Return all (filtered) events as an RSS 2.0 feed."""
    p = _filter_params(request)
    events = (
        _events_qs(p)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("-created_at")[:MAX_EVENTS]
    )
    
    # Build feed link (preserve query string for filters)
    qs = request.GET.urlencode()
    feed_path = reverse("dashboard-events-rss")
    feed_url = request.build_absolute_uri(feed_path)
    if qs:
        feed_url = f"{feed_url}?{qs}"
    
    body = _build_rss(
        events,
        title="SADIE Events",
        link=request.build_absolute_uri("/"),
        description="Arts and culture events aggregated by SADIE",
    )
    return _rss_response(body, "sadie-events.rss")


@require_safe
@cache_control(public=True, max_age=600)
def org_events_rss(request, slug: str) -> HttpResponse:
    """Return all events for a single organisation as an RSS 2.0 feed."""
    org = get_object_or_404(Organisation, slug=slug)
    events = (
        Event.objects.filter(organisation=org)
        .select_related("organisation", "location")
        .prefetch_related("categories")
        .order_by("-created_at")[:MAX_EVENTS]
    )
    
    body = _build_rss(
        events,
        title=f"SADIE – {org.name}",
        link=request.build_absolute_uri("/"),
        description=f"Events from {org.name}",
    )
    return _rss_response(body, f"sadie-{slug}.rss")
