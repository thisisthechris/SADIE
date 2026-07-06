from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import journeys_views, recommendations_views, stats_views, viz_views
from .views import PostcodeAreaInteractionViewSet, UserHashInteractionViewSet

router = DefaultRouter()
router.register(r"interactions", UserHashInteractionViewSet, basename="interaction")
router.register(r"postcodes", PostcodeAreaInteractionViewSet, basename="postcode")

urlpatterns = [
    path("", include(router.urls)),
    path("stats/event/<int:event_id>/", stats_views.event_stats, name="stats-event"),
    path("stats/summary/", stats_views.summary, name="stats-summary"),
    path("stats/top-orgs/", stats_views.top_orgs, name="stats-top-orgs"),
    path("stats/top-categories/", stats_views.top_categories, name="stats-top-categories"),
    path(
        "stats/interactions-timeseries/",
        stats_views.interactions_timeseries,
        name="stats-interactions-timeseries",
    ),
    path(
        "stats/interactions-by-type/",
        stats_views.interactions_by_type,
        name="stats-interactions-by-type",
    ),
    path(
        "stats/postcode-aggregates/",
        stats_views.postcode_aggregates,
        name="stats-postcode-aggregates",
    ),
    path(
        "stats/headline/",
        stats_views.headline,
        name="stats-headline",
    ),
    path(
        "stats/visitors-new-returning/",
        stats_views.visitors_new_returning,
        name="stats-visitors-new-returning",
    ),
    path(
        "stats/activity-by-weekday/",
        stats_views.activity_by_weekday,
        name="stats-activity-by-weekday",
    ),
    path(
        "stats/category-trends/",
        stats_views.category_trends,
        name="stats-category-trends",
    ),
    path(
        "stats/top-venues/",
        stats_views.top_venues,
        name="stats-top-venues",
    ),
    path(
        "stats/engagement/",
        stats_views.engagement,
        name="stats-engagement",
    ),
    # Phase 3 — 3D visualisation data
    path("viz/event-points/", viz_views.event_points, name="viz-event-points"),
    path("viz/event-list/", viz_views.event_list, name="viz-event-list"),
    path("viz/postcode-bars/", viz_views.postcode_bars, name="viz-postcode-bars"),
    path("viz/postcode-records/", viz_views.postcode_records, name="viz-postcode-records"),
    path("viz/postcode-points/", viz_views.postcode_points, name="viz-postcode-points"),
    path("viz/postcode-heat/", viz_views.postcode_heat, name="viz-postcode-heat"),
    path("viz/network/", viz_views.network, name="viz-network"),
    path("viz/spatiotemporal/", viz_views.spatiotemporal, name="viz-spatiotemporal"),
    path("viz/journeys-paths/", viz_views.journeys_paths, name="viz-journeys-paths"),
    path("viz/journeys-flows/", viz_views.journeys_flows, name="viz-journeys-flows"),
    path("viz/org-connections/", viz_views.org_connections, name="viz-org-connections"),
    path("viz/postcode-districts/", viz_views.postcode_districts, name="viz-postcode-districts"),
    path("viz/postcode-flows/", viz_views.postcode_flows, name="viz-postcode-flows"),
    # Phase 4 — Recommendations
    path(
        "recommendations/similar/<int:event_id>/",
        recommendations_views.similar_events,
        name="rec-similar",
    ),
    path(
        "recommendations/near/",
        recommendations_views.near_postcode,
        name="rec-near",
    ),
    # Phase 4 follow-up — Journeys analytics (parity with legacy /journeys/)
    path(
        "journeys/summary/",
        journeys_views.journeys_summary,
        name="journeys-summary",
    ),
]
