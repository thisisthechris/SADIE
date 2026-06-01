"""Dashboard views — legacy views have been migrated to React SPA at /app/*.

This module is kept for backwards compatibility with ICS feed and short link generation.
It provides helper functions needed by ics_feed.py.
"""

from analytics.queries import parse_filter_params, events_qs as analytics_events_qs


def _filter_params(request):
    """Parse filter parameters from request (consumed by ics_feed.py)."""
    return parse_filter_params(request)


def _events_qs(p):
    """Return filtered Event queryset (consumed by ics_feed.py)."""
    return analytics_events_qs(p)

