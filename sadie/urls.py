from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/organisations/", include("organisations.urls")),
    path("api/events/", include("events.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/upload/", include("analytics.upload_urls")),
    path("", include("dashboard.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
