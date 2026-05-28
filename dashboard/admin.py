from django.contrib import admin

from .models import SavedView


@admin.register(SavedView)
class SavedViewAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "path", "is_public", "slug", "updated_at")
    list_filter = ("is_public",)
    search_fields = ("name", "user__username", "path")
    readonly_fields = ("slug", "created_at", "updated_at")
