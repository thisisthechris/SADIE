"""
Hashing utilities for keeping PII (names, emails) out of the database.

Only a salted SHA-256 hash of a normalized email is ever persisted (as
``UserHashInteraction.user_hash``). The raw email/name must never be logged,
stored in a model field, or included in an exception message.
"""

import hashlib

from django.conf import settings


def normalize_email(email: str) -> str:
    """Lower-case and strip whitespace so the same person always hashes the same way."""
    return (email or "").strip().lower()


def hash_email(email: str) -> str:
    """
    Return a 64-character lowercase hex SHA-256 hash of a salted, normalized email.

    Matches the format required by UserHashInteractionUploadSerializer
    (analytics/serializers.py): exactly 64 lowercase hex characters.
    """
    normalized = normalize_email(email)
    salted = f"{settings.PII_HASH_SALT}{normalized}"
    return hashlib.sha256(salted.encode("utf-8")).hexdigest()
