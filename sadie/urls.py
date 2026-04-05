from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

admin.site.site_header = "SADIE Admin"
admin.site.site_title = "SADIE Admin"
admin.site.index_title = "Welcome to SADIE Admin"

urlpatterns = [
    path("herebedragons/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path("api/organisations/", include("organisations.urls")),
    path("api/events/", include("events.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/upload/", include("analytics.upload_urls")),
    path("", include("dashboard.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
