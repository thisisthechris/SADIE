from django.urls import path

from .api_views import short_link
from .ics_feed import events_ics, org_events_ics

urlpatterns = [
    # ICS/iCal subscription endpoints
    path("calendar.ics", events_ics, name="dashboard-events-ics"),
    path("calendar/org/<slug:slug>.ics", org_events_ics, name="dashboard-org-events-ics"),
    # Saved view short links
    path("v/<slug:slug>/", short_link, name="savedview-short-link"),
]
