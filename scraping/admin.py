from django.contrib import admin
from django.utils import timezone

from .models import ImportedEvent, ScrapeRun, ScrapeSource


@admin.register(ScrapeSource)
class ScrapeSourceAdmin(admin.ModelAdmin):
    list_display = ("name", "enabled", "scrape_interval_hours", "last_scraped_at")
    list_filter = ("enabled",)
    readonly_fields = ("created_at", "updated_at", "last_scraped_at")


@admin.register(ScrapeRun)
class ScrapeRunAdmin(admin.ModelAdmin):
    list_display = ("source", "started_at", "finished_at", "status", "events_found", "events_created", "events_updated")
    list_filter = ("source", "status")
    readonly_fields = (
        "source",
        "started_at",
        "finished_at",
        "status",
        "events_found",
        "events_created",
        "events_updated",
        "events_skipped",
        "error_message",
    )
    ordering = ("-started_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(ImportedEvent)
class ImportedEventAdmin(admin.ModelAdmin):
    list_display = ("title", "source", "status", "venue_name", "start_datetime", "created_at")
    list_filter = ("status", "source")
    list_editable = ("status",)
    search_fields = ("title", "venue_name", "external_id")
    readonly_fields = (
        "source",
        "scrape_run",
        "external_id",
        "raw_data",
        "created_at",
        "updated_at",
    )
    raw_id_fields = ("matched_event", "matched_organisation", "matched_location")
    fieldsets = (
        (
            "Source",
            {
                "fields": ("source", "scrape_run", "external_id", "status", "raw_data"),
            },
        ),
        (
            "Event Details",
            {
                "fields": (
                    "title",
                    "description",
                    "start_datetime",
                    "end_datetime",
                    "source_url",
                    "image_url",
                ),
            },
        ),
        (
            "Venue",
            {
                "fields": (
                    "venue_name",
                    "venue_address",
                    "venue_postcode",
                    "venue_lat",
                    "venue_lng",
                ),
            },
        ),
        (
            "Tags",
            {
                "fields": ("categories_raw", "tags_raw"),
            },
        ),
        (
            "Matching",
            {
                "fields": (
                    "matched_event",
                    "matched_organisation",
                    "matched_location",
                ),
            },
        ),
        (
            "Review",
            {
                "fields": ("review_notes", "reviewed_by", "reviewed_at"),
            },
        ),
    )
    actions = ["approve_selected", "reject_selected", "import_approved"]

    @admin.action(description="Approve selected events")
    def approve_selected(self, request, queryset):
        updated = queryset.filter(status__in=["pending", "auto_matched"]).update(
            status="approved",
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} event(s) marked as approved.")

    @admin.action(description="Reject selected events")
    def reject_selected(self, request, queryset):
        updated = queryset.filter(status__in=["pending", "auto_matched"]).update(
            status="rejected",
            reviewed_by=request.user,
            reviewed_at=timezone.now(),
        )
        self.message_user(request, f"{updated} event(s) rejected.")

    @admin.action(description="Import approved events into main database")
    def import_approved(self, request, queryset):
        from .services import import_approved_event

        approved = queryset.filter(status="approved")
        imported = 0
        errors = []
        for ie in approved:
            try:
                import_approved_event(ie)
                imported += 1
            except Exception as exc:
                errors.append(f"{ie.title}: {exc}")

        msg = f"{imported} event(s) imported."
        if errors:
            msg += f" {len(errors)} error(s): " + "; ".join(errors[:5])
        self.message_user(request, msg)
