from django.urls import path

from .upload_views import PostcodeAreaInteractionUploadView, UserHashInteractionUploadView

urlpatterns = [
    path("interactions/", UserHashInteractionUploadView.as_view(), name="upload-interactions"),
    path("postcodes/", PostcodeAreaInteractionUploadView.as_view(), name="upload-postcodes"),
]
