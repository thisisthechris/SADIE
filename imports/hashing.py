"""
Hashing utilities for keeping PII (names, emails) out of the database.

Two steps, so a raw email never has to reach the server:

1. ``client_hash`` — SHA-256 of a versioned prefix plus the normalised email.
   The browser upload tool computes exactly this with Web Crypto
   (``frontend/src/lib/upload/hash.ts``); only this value is sent.
2. ``server_hash`` — HMAC-SHA256 of the client hash keyed with the secret
   ``PII_HASH_SALT``. This is what gets stored as ``user_hash``.

The secret never leaves the server, and the email never reaches it. The raw
email/name must never be logged, stored in a model field, or included in an
exception message.
"""

import hashlib
import hmac
import re

from django.conf import settings

CLIENT_HASH_PREFIX = "sadie-v1:"
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def normalize_email(email: str) -> str:
    """Lower-case and strip whitespace so the same person always hashes the same way."""
    return (email or "").strip().lower()


def client_hash(email: str) -> str:
    """Browser-side hash of an email (64 lowercase hex chars). Mirrors the frontend."""
    return hashlib.sha256(f"{CLIENT_HASH_PREFIX}{normalize_email(email)}".encode()).hexdigest()


def is_client_hash(value: str) -> bool:
    return bool(_HEX64.match(value or ""))


def server_hash(client_hash_value: str) -> str:
    """Key a client hash with the server-only salt. Returns 64 lowercase hex chars."""
    return hmac.new(
        settings.PII_HASH_SALT.encode("utf-8"), client_hash_value.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def hash_email(email: str) -> str:
    """
    Stored hash for an email: ``server_hash(client_hash(email))``.

    Matches the format required by UserHashInteractionUploadSerializer
    (analytics/serializers.py): exactly 64 lowercase hex characters, and is
    identical whether the email was hashed here or in the browser upload tool.
    """
    return server_hash(client_hash(email))
