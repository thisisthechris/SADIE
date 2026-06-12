from django.urls import path

from .api_views import short_link
from .ics_feed import events_ics, org_events_ics
from .json_feed import events_json, org_events_json
from .rss_feed import events_rss, org_events_rss

urlpatterns = [
    # ICS/iCal subscription endpoints
    path("calendar.ics", events_ics, name="dashboard-events-ics"),
    path("calendar/org/<slug:slug>.ics", org_events_ics, name="dashboard-org-events-ics"),
    # JSON feed endpoints
    path("events.json", events_json, name="dashboard-events-json"),
    path("api/events/org/<slug:slug>/events.json", org_events_json, name="dashboard-org-events-json"),
    # RSS feed endpoints
    path("events.rss", events_rss, name="dashboard-events-rss"),
    path("rss/org/<slug:slug>.rss", org_events_rss, name="dashboard-org-events-rss"),
    # Saved view short links
    path("v/<slug:slug>/", short_link, name="savedview-short-link"),
]
