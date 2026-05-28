from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImportedEventViewSet, ScrapeRunViewSet, ScrapeSourceViewSet

router = DefaultRouter()
router.register(r"imports", ImportedEventViewSet, basename="imported-event")
router.register(r"sources", ScrapeSourceViewSet, basename="scrape-source")
router.register(r"runs", ScrapeRunViewSet, basename="scrape-run")

urlpatterns = [
    path("", include(router.urls)),
]
