"""DRF router-mounted URLs for the dashboard app (saved views)."""

from rest_framework.routers import DefaultRouter

from .api_views import SavedViewViewSet

router = DefaultRouter()
router.register(r"views", SavedViewViewSet, basename="savedview")

urlpatterns = router.urls
