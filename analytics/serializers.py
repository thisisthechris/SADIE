import re

from rest_framework import serializers

from .models import PostcodeAreaInteraction, UserHashInteraction

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


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

    def validate_user_hash(self, value):
        """Require exactly 64 lowercase hex characters (SHA-256 hash)."""
        if not _SHA256_RE.match(value):
            raise serializers.ValidationError("user_hash must be a 64-character lowercase hexadecimal SHA-256 hash.")
        return value

    def validate(self, attrs):
        """Require event when interaction_type is 'event', location when 'location'."""
        interaction_type = attrs.get("interaction_type")
        if interaction_type == "event" and not attrs.get("event"):
            raise serializers.ValidationError({"event": "This field is required when interaction_type is 'event'."})
        if interaction_type == "location" and not attrs.get("location"):
            raise serializers.ValidationError(
                {"location": "This field is required when interaction_type is 'location'."}
            )
        return attrs


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

    def validate(self, attrs):
        """Require period_start to be on or before period_end."""
        period_start = attrs.get("period_start")
        period_end = attrs.get("period_end")
        if period_start is not None and period_end is not None and period_start > period_end:
            raise serializers.ValidationError(
                {
                    "period_start": "period_start must be before or equal to period_end.",
                    "period_end": "period_end must be after or equal to period_start.",
                }
            )
        return attrs
