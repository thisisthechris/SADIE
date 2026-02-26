from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import OrganisationViewSet, LocationViewSet

router = DefaultRouter()
router.register(r"", OrganisationViewSet, basename="organisation")
router.register(r"locations", LocationViewSet, basename="location")

urlpatterns = [
    path("", include(router.urls)),
]
