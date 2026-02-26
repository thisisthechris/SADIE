from django.contrib import admin

from .models import PostcodeAreaInteraction, UserHashInteraction


@admin.register(UserHashInteraction)
class UserHashInteractionAdmin(admin.ModelAdmin):
    list_display = [
        "user_hash_short",
        "interaction_type",
        "organisation",
        "event",
        "location",
        "interaction_date",
        "created_at",
    ]
    list_filter = ["interaction_type", "organisation", "interaction_date"]
    search_fields = ["user_hash", "organisation__name", "event__title", "location__name"]
    readonly_fields = ["created_at"]
    raw_id_fields = ["organisation", "event", "location"]
    date_hierarchy = "interaction_date"

    @admin.display(description="User Hash")
    def user_hash_short(self, obj):
        return f"{obj.user_hash[:12]}…"


@admin.register(PostcodeAreaInteraction)
class PostcodeAreaInteractionAdmin(admin.ModelAdmin):
    list_display = [
        "postcode",
        "area",
        "organisation",
        "interaction_count",
        "period_start",
        "period_end",
        "created_at",
    ]
    list_filter = ["organisation", "period_end"]
    search_fields = ["postcode", "area", "organisation__name"]
    readonly_fields = ["created_at"]
    raw_id_fields = ["organisation"]
    date_hierarchy = "period_end"
