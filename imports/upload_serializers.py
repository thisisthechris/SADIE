"""Strict validation for rows sent by the browser upload tool.

The browser drops names, emails, booking references, notes and full postcodes
before upload. This is the server-side backstop: rows may only contain the
allowlisted keys below, the person identifier must already be a SHA-256 hash,
the postcode must be a sector (``PL4 5``), and free-text fields are rejected
if they contain anything that looks like an email address or phone number.
"""

from __future__ import annotations

import re

from rest_framework import serializers

from .hashing import is_client_hash

ALLOWED_ROW_KEYS = {
    "client_hash",
    "postcode_sector",
    "event_title",
    "event_date",
    "purchase_date",
    "ticket_quantity",
    "attended_count",
    "ticket_price",
    "venue_name",
    "has_ticket_data",
}

MAX_ROWS_PER_CHUNK = 2000

_SECTOR_RE = re.compile(r"^[A-Z]{1,2}[0-9][0-9A-Z]? [0-9]$")
_EMAIL_RE = re.compile(r"[^\s@]+@[^\s@]+\.[^\s@]+")
# 9+ digits, allowing spaces, dashes, dots, brackets and a leading +.
_PHONE_RE = re.compile(r"\+?\d(?:[\s\-().]*\d){8,}")
# A full UK postcode anywhere in text (outward code + full inward code).
_FULL_POSTCODE_RE = re.compile(r"\b[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}\b", re.IGNORECASE)


def _no_personal_data(value: str) -> str:
    if _EMAIL_RE.search(value) or _PHONE_RE.search(value) or _FULL_POSTCODE_RE.search(value):
        raise serializers.ValidationError("Looks like personal data (email, phone or full postcode).")
    return value


class UploadRowSerializer(serializers.Serializer):
    client_hash = serializers.CharField(max_length=64)
    postcode_sector = serializers.CharField(max_length=8)
    event_title = serializers.CharField(max_length=300)
    event_date = serializers.DateField()
    purchase_date = serializers.DateField(required=False, allow_null=True)
    ticket_quantity = serializers.IntegerField(min_value=0, max_value=1000, default=1)
    attended_count = serializers.IntegerField(min_value=0, max_value=1000)
    ticket_price = serializers.DecimalField(
        max_digits=8, decimal_places=2, min_value=0, required=False, allow_null=True
    )
    venue_name = serializers.CharField(max_length=200, required=False, allow_blank=True, allow_null=True)
    has_ticket_data = serializers.BooleanField(default=True)

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Each row must be an object.")
        unexpected = sorted(set(data) - ALLOWED_ROW_KEYS)
        if unexpected:
            raise serializers.ValidationError({"non_field_errors": [f"Unexpected fields: {', '.join(unexpected)}"]})
        return super().to_internal_value(data)

    def validate_client_hash(self, value):
        if not is_client_hash(value):
            raise serializers.ValidationError("Must be a 64-character lowercase SHA-256 hash.")
        return value

    def validate_postcode_sector(self, value):
        value = value.strip().upper()
        if not _SECTOR_RE.match(value):
            raise serializers.ValidationError("Must be a postcode sector such as 'PL4 5', not a full postcode.")
        return value

    def validate_event_title(self, value):
        return _no_personal_data(value.strip())

    def validate_venue_name(self, value):
        return _no_personal_data(value.strip()) if value else value

    def validate(self, attrs):
        if attrs["attended_count"] > max(attrs["ticket_quantity"], 1) * 50:
            raise serializers.ValidationError("attended_count is implausibly larger than ticket_quantity.")
        return attrs


class UploadBatchCreateSerializer(serializers.Serializer):
    organisation = serializers.IntegerField()
    source_format = serializers.CharField(max_length=60)
    file_fingerprint = serializers.RegexField(r"^[0-9a-f]{64}$")
    file_label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    skipped_count = serializers.IntegerField(min_value=0, default=0)
    force = serializers.BooleanField(default=False)

    def validate_file_label(self, value):
        # File names sometimes contain a person's name or email; drop rather than reject.
        try:
            return _no_personal_data(value.strip())
        except serializers.ValidationError:
            return ""
