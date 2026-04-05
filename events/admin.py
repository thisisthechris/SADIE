from django.contrib import admin

from .models import Category, Event


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug"]
    search_fields = ["name"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ["title", "organisation", "start_datetime", "end_datetime", "location", "external_id", "created_at"]
    list_filter = ["organisation", "location", "start_datetime", "categories"]
    search_fields = ["title", "description", "organisation__name", "location__name", "external_id"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["organisation", "location"]
    filter_horizontal = ["categories"]
    date_hierarchy = "start_datetime"
