from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from . import auth_views
from .search_views import search as search_view

admin.site.site_header = "SADIE Admin"
admin.site.site_title = "SADIE Admin"
admin.site.index_title = "Welcome to SADIE Admin"

urlpatterns = [
    path("herebedragons/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path("api/config/", auth_views.config, name="api-config"),
    path("api/auth/csrf/", auth_views.csrf, name="api-auth-csrf"),
    path("api/auth/me/", auth_views.me, name="api-auth-me"),
    path("api/auth/login/", auth_views.login_view, name="api-auth-login"),
    path("api/auth/logout/", auth_views.logout_view, name="api-auth-logout"),
    path("api/auth/users/", auth_views.users_search, name="api-auth-users"),
    path("api/search/", search_view, name="api-search"),
    path("api/organisations/", include("organisations.urls")),
    path("api/events/", include("events.urls")),
    path("api/analytics/", include("analytics.urls")),
    path("api/upload/", include("analytics.upload_urls")),
    path("api/", include("dashboard.api_urls")),
    path("api/", include("scraping.urls")),
    # Public feeds (ICS/RSS/JSON) and saved-view short links. The React SPA is
    # served separately by the nginx front-door container, not by Django.
    path("", include("dashboard.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
