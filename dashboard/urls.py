from django.urls import path
from . import views

urlpatterns = [
    path("", views.home, name="dashboard-home"),
    path("map/", views.organisations_map, name="dashboard-map"),
    path("calendar/", views.events_calendar, name="dashboard-calendar"),
    path("journeys/", views.user_journeys, name="dashboard-journeys"),
    path("postcodes/", views.postcode_heatmap, name="dashboard-postcodes"),
]
