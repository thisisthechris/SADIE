from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LocationViewSet, OrganisationViewSet

router = DefaultRouter()
router.register(r"", OrganisationViewSet, basename="organisation")
router.register(r"locations", LocationViewSet, basename="location")

urlpatterns = [
    path("", include(router.urls)),
]
