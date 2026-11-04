from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import LocationViewSet, OrganisationViewSet, OrgGoalViewSet, public_partners

router = DefaultRouter()
router.register(r"goals", OrgGoalViewSet, basename="orggoal")
router.register(r"locations", LocationViewSet, basename="location")
router.register(r"", OrganisationViewSet, basename="organisation")

urlpatterns = [
    path("public/partners/", public_partners, name="organisations-public-partners"),
    path("", include(router.urls)),
]
