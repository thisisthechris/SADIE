from rest_framework_gis.serializers import GeoFeatureModelSerializer
from rest_framework import serializers
from .models import Organisation, Location


class LocationSerializer(GeoFeatureModelSerializer):
    class Meta:
        model = Location
        geo_field = "point"
        fields = ["id", "name", "address", "postcode", "point", "created_at"]


class OrganisationSerializer(serializers.ModelSerializer):
    locations = LocationSerializer(many=True, read_only=True)
    event_count = serializers.SerializerMethodField()

    class Meta:
        model = Organisation
        fields = [
            "id",
            "name",
            "website",
            "description",
            "event_count",
            "locations",
            "created_at",
            "updated_at",
        ]

    def get_event_count(self, obj):
        return obj.events.count()


class OrganisationListSerializer(serializers.ModelSerializer):
    location_count = serializers.IntegerField(
        source="locations.count", read_only=True
    )
    event_count = serializers.IntegerField(source="events.count", read_only=True)

    class Meta:
        model = Organisation
        fields = [
            "id",
            "name",
            "website",
            "description",
            "location_count",
            "event_count",
            "created_at",
        ]
