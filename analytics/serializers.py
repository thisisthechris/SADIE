from rest_framework import serializers
from .models import UserHashInteraction, PostcodeAreaInteraction


class UserHashInteractionSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True, allow_null=True)
    location_name = serializers.CharField(source="location.name", read_only=True, allow_null=True)

    class Meta:
        model = UserHashInteraction
        fields = [
            "id",
            "user_hash",
            "interaction_type",
            "event",
            "event_title",
            "location",
            "location_name",
            "organisation",
            "organisation_name",
            "interaction_date",
            "created_at",
        ]


class UserHashInteractionUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserHashInteraction
        fields = [
            "user_hash",
            "interaction_type",
            "event",
            "location",
            "organisation",
            "interaction_date",
        ]


class PostcodeAreaInteractionSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)

    class Meta:
        model = PostcodeAreaInteraction
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "postcode",
            "area",
            "interaction_count",
            "period_start",
            "period_end",
            "created_at",
        ]


class PostcodeAreaInteractionUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostcodeAreaInteraction
        fields = [
            "organisation",
            "postcode",
            "area",
            "interaction_count",
            "period_start",
            "period_end",
        ]
