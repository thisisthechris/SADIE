from rest_framework import serializers

from organisations.serializers import LocationSerializer, OrganisationListSerializer

from .models import Category, Event


class CategorySerializer(serializers.ModelSerializer):
    event_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Category
        fields = ["id", "name", "slug", "event_count"]


class EventSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    location_name = serializers.CharField(source="location.name", read_only=True, allow_null=True)
    categories = CategorySerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "title",
            "description",
            "start_datetime",
            "end_datetime",
            "url",
            "location",
            "location_name",
            "categories",
            "image_url",
            "source_url",
            "source_tags",
            "created_at",
            "updated_at",
        ]


class EventDetailSerializer(serializers.ModelSerializer):
    organisation = OrganisationListSerializer(read_only=True)
    location = LocationSerializer(read_only=True)
    categories = CategorySerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "organisation",
            "title",
            "description",
            "start_datetime",
            "end_datetime",
            "url",
            "location",
            "categories",
            "image_url",
            "source_url",
            "source_tags",
            "created_at",
            "updated_at",
        ]
