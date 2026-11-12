"""Two-step hashing: the browser and the server must agree on ``client_hash``."""

from django.test import SimpleTestCase, override_settings

from .hashing import client_hash, hash_email, is_client_hash, server_hash

# Shared with frontend/src/lib/upload/hash.test.ts — change both together.
EMAIL = "  Jane.Doe@Example.com "
CLIENT_VECTOR = "19c168e17a9846400f8072d2841c3a3e36d7b2592e5179a5671a52f93ffc1bf2"
SERVER_VECTOR = "703a89e63f6d3cb58acbbd34b458b4e0650318012520fafa04a007c9598d02f7"


@override_settings(PII_HASH_SALT="dev-pii-hash-salt")
class TwoStepHashTest(SimpleTestCase):
    def test_client_hash_matches_shared_vector(self):
        self.assertEqual(client_hash(EMAIL), CLIENT_VECTOR)

    def test_server_hash_keys_the_client_hash(self):
        self.assertEqual(server_hash(CLIENT_VECTOR), SERVER_VECTOR)
        self.assertEqual(hash_email(EMAIL), SERVER_VECTOR)

    def test_salt_changes_stored_hash(self):
        with override_settings(PII_HASH_SALT="other"):
            self.assertNotEqual(server_hash(CLIENT_VECTOR), SERVER_VECTOR)

    def test_is_client_hash(self):
        self.assertTrue(is_client_hash(CLIENT_VECTOR))
        for bad in ("", CLIENT_VECTOR.upper(), CLIENT_VECTOR[:-1], "jane@example.com"):
            self.assertFalse(is_client_hash(bad))
