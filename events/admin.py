from django.contrib import admin

from .models import Event


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "organisation", "start_datetime", "end_datetime", "location", "created_at"]
    list_filter = ["organisation", "location", "start_datetime"]
    search_fields = ["title", "description", "organisation__name", "location__name"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["organisation", "location"]
    date_hierarchy = "start_datetime"
