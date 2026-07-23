import re

from rest_framework import serializers

from .models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)

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


class PostcodeEventInteractionSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True, allow_null=True)
    location_name = serializers.CharField(source="location.name", read_only=True, allow_null=True)

    class Meta:
        model = PostcodeEventInteraction
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "postcode",
            "area",
            "event",
            "event_title",
            "location",
            "location_name",
            "interaction_count",
            "interaction_date",
            "created_at",
        ]


class PostcodeEventInteractionUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostcodeEventInteraction
        fields = [
            "organisation",
            "postcode",
            "area",
            "event",
            "location",
            "interaction_count",
            "interaction_date",
        ]
        extra_kwargs = {
            "organisation": {"required": False},
            "location": {"required": False},
            "interaction_date": {"required": False},
            "interaction_count": {"required": True},
        }

    def validate(self, attrs):
        """Require an event and derive organisation/location/date from it.

        The event is mandatory (a postcode cohort always interacts *through* an
        event). Organisation, venue and the ordering date default from the event
        when the uploader omits them, so partners only need to send the postcode,
        event and count.
        """
        event = attrs.get("event")
        if event is None:
            raise serializers.ValidationError({"event": "This field is required."})

        if not attrs.get("organisation"):
            attrs["organisation"] = event.organisation
        if not attrs.get("location") and event.location_id:
            attrs["location"] = event.location
        if not attrs.get("interaction_date"):
            attrs["interaction_date"] = event.start_datetime.date()

        count = attrs.get("interaction_count")
        if count is not None and count <= 0:
            raise serializers.ValidationError(
                {"interaction_count": "interaction_count must be a positive integer."}
            )
        return attrs


class PostcodeTicketPurchaseSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(source="organisation.name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True, allow_null=True)
    location_name = serializers.CharField(source="location.name", read_only=True, allow_null=True)

    class Meta:
        model = PostcodeTicketPurchase
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "postcode",
            "area",
            "event",
            "event_title",
            "location",
            "location_name",
            "ticket_quantity",
            "purchase_date",
            "created_at",
        ]


class PostcodeTicketPurchaseUploadSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostcodeTicketPurchase
        fields = [
            "organisation",
            "postcode",
            "area",
            "event",
            "location",
            "ticket_quantity",
            "purchase_date",
        ]
        extra_kwargs = {
            "organisation": {"required": False},
            "location": {"required": False},
            "ticket_quantity": {"required": True},
            "purchase_date": {"required": True},
        }

    def validate(self, attrs):
        """Require an event and derive organisation/location from it.

        Unlike ``PostcodeEventInteractionUploadSerializer``, ``purchase_date`` is
        NOT defaulted from the event — the whole point of this dataset is the
        actual purchase date (usually well before the event), so partners must
        supply it.
        """
        event = attrs.get("event")
        if event is None:
            raise serializers.ValidationError({"event": "This field is required."})

        if not attrs.get("organisation"):
            attrs["organisation"] = event.organisation
        if not attrs.get("location") and event.location_id:
            attrs["location"] = event.location

        quantity = attrs.get("ticket_quantity")
        if quantity is not None and quantity <= 0:
            raise serializers.ValidationError(
                {"ticket_quantity": "ticket_quantity must be a positive integer."}
            )
        return attrs
