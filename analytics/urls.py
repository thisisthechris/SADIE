from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import UserHashInteractionViewSet, PostcodeAreaInteractionViewSet

router = DefaultRouter()
router.register(r"interactions", UserHashInteractionViewSet, basename="interaction")
router.register(r"postcodes", PostcodeAreaInteractionViewSet, basename="postcode")

urlpatterns = [
    path("", include(router.urls)),
]
