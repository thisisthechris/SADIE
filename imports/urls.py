from django.urls import path

from . import upload_views

urlpatterns = [
    path("", upload_views.uploads, name="uploads"),
    path("organisations/", upload_views.upload_organisations, name="upload-organisations"),
    path("<int:pk>/rows/", upload_views.upload_rows, name="upload-rows"),
    path("<int:pk>/complete/", upload_views.upload_complete, name="upload-complete"),
    path("<int:pk>/undo/", upload_views.upload_undo, name="upload-undo"),
]
