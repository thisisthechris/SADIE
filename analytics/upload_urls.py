from django.urls import path

from .upload_views import (
    PostcodeAreaInteractionUploadView,
    PostcodeEventInteractionUploadView,
    PostcodeTicketPurchaseUploadView,
    UserHashInteractionUploadView,
)

urlpatterns = [
    path("interactions/", UserHashInteractionUploadView.as_view(), name="upload-interactions"),
    path("postcodes/", PostcodeAreaInteractionUploadView.as_view(), name="upload-postcodes"),
    path(
        "postcode-events/",
        PostcodeEventInteractionUploadView.as_view(),
        name="upload-postcode-events",
    ),
    path(
        "postcode-tickets/",
        PostcodeTicketPurchaseUploadView.as_view(),
        name="upload-postcode-tickets",
    ),
]
