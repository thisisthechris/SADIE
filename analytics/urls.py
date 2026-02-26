from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PostcodeAreaInteractionViewSet, UserHashInteractionViewSet

router = DefaultRouter()
router.register(r"interactions", UserHashInteractionViewSet, basename="interaction")
router.register(r"postcodes", PostcodeAreaInteractionViewSet, basename="postcode")

urlpatterns = [
    path("", include(router.urls)),
]
