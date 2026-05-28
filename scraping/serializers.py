from rest_framework import serializers

from events.models import Event
from organisations.serializers import LocationSerializer, OrganisationListSerializer

from .models import ImportedEvent, ScrapeRun, ScrapeSource


class ScrapeSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScrapeSource
        fields = ["id", "name", "base_url", "enabled", "last_scraped_at"]


class ScrapeRunSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source="source.name", read_only=True)

    class Meta:
        model = ScrapeRun
        fields = [
            "id",
            "source",
            "source_name",
            "started_at",
            "finished_at",
            "status",
            "events_found",
            "events_created",
            "events_updated",
            "events_skipped",
            "error_message",
        ]


class ImportedEventListSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source="source.name", read_only=True)
    matched_organisation_name = serializers.CharField(
        source="matched_organisation.name", read_only=True, allow_null=True
    )
    matched_event_id = serializers.IntegerField(source="matched_event.id", read_only=True, allow_null=True)
    reviewed_by_username = serializers.CharField(
        source="reviewed_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = ImportedEvent
        fields = [
            "id",
            "source",
            "source_name",
            "external_id",
            "title",
            "description",
            "start_datetime",
            "end_datetime",
            "source_url",
            "image_url",
            "venue_name",
            "venue_address",
            "venue_postcode",
            "categories_raw",
            "tags_raw",
            "status",
            "matched_event_id",
            "matched_organisation",
            "matched_organisation_name",
            "matched_location",
            "review_notes",
            "reviewed_by_username",
            "reviewed_at",
            "created_at",
        ]


class ImportedEventDetailSerializer(ImportedEventListSerializer):
    raw_data = serializers.JSONField(read_only=True)
    matched_event = serializers.SerializerMethodField()
    matched_organisation = OrganisationListSerializer(read_only=True)
    matched_location = LocationSerializer(read_only=True)

    class Meta(ImportedEventListSerializer.Meta):
        fields = ImportedEventListSerializer.Meta.fields + ["raw_data", "matched_event"]

    def get_matched_event(self, obj):
        e = obj.matched_event
        if not e:
            return None
        return {
            "id": e.id,
            "title": e.title,
            "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
            "organisation": {"id": e.organisation_id, "name": e.organisation.name},
        }


class BulkActionSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    action = serializers.ChoiceField(choices=["approve", "reject", "import", "reset"])
    notes = serializers.CharField(required=False, allow_blank=True)
