from django.contrib import admin

try:
    from django.contrib.gis.admin import GISModelAdmin as _LocationAdminBase
except Exception:
    _LocationAdminBase = admin.ModelAdmin

from .models import Organisation, Location


@admin.register(Organisation)
class OrganisationAdmin(admin.ModelAdmin):
    list_display = ["name", "website", "created_at", "updated_at"]
    list_filter = ["created_at"]
    search_fields = ["name", "description", "website"]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(Location)
class LocationAdmin(_LocationAdminBase):
    list_display = ["name", "organisation", "postcode", "created_at"]
    list_filter = ["organisation", "created_at"]
    search_fields = ["name", "address", "postcode", "organisation__name"]
    readonly_fields = ["created_at"]
    raw_id_fields = ["organisation"]
