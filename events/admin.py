from django.contrib import admin

from .models import Category, Event, EventCategory


class EventCategoryInline(admin.TabularInline):
    model = EventCategory
    extra = 0
    autocomplete_fields = ["category"]

    def get_formset(self, request, obj=None, **kwargs):
        formset = super().get_formset(request, obj, **kwargs)
        # Categories added by hand in admin are staff-set, not partner-tagged.
        formset.form.base_fields["source"].initial = EventCategory.Source.MANUAL
        return formset


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug"]
    search_fields = ["name"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "organisation",
        "start_datetime",
        "end_datetime",
        "location",
        "is_free",
        "price",
        "external_id",
        "created_at",
    ]
    list_filter = ["organisation", "location", "start_datetime", "categories", "eventcategory__source", "is_free"]
    search_fields = ["title", "description", "organisation__name", "location__name", "external_id"]
    readonly_fields = ["created_at", "updated_at"]
    raw_id_fields = ["organisation", "location"]
    inlines = [EventCategoryInline]
    date_hierarchy = "start_datetime"
