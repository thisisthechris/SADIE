from django.urls import path

from . import views
from .api_views import short_link
from .ics_feed import events_ics, org_events_ics

urlpatterns = [
    path("", views.home, name="dashboard-home"),
    path("map/", views.organisations_map, name="dashboard-map"),
    path("events-map/", views.events_map, name="dashboard-events-map"),
    path("calendar/", views.events_calendar, name="dashboard-calendar"),
    path("calendar.ics", events_ics, name="dashboard-events-ics"),
    path("calendar/org/<slug:slug>.ics", org_events_ics, name="dashboard-org-events-ics"),
    path("journeys/", views.user_journeys, name="dashboard-journeys"),
    path("postcodes/", views.postcode_heatmap, name="dashboard-postcodes"),
    path("v/<slug:slug>/", short_link, name="savedview-short-link"),
]
