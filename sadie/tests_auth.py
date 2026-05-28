"""Tests for the SPA auth and runtime-config endpoints."""

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


class ConfigEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(MAPTILER_API_KEY="test-key-123")
    def test_config_returns_maptiler_key(self):
        r = self.client.get("/api/config/")
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d["maptiler_api_key"], "test-key-123")
        self.assertIn("default_map_center", d)
        self.assertIn("default_map_zoom", d)


class AuthFlowTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user("alice", password="hunter2")

    def test_me_anonymous_is_401(self):
        r = self.client.get("/api/auth/me/")
        self.assertEqual(r.status_code, 401)

    def test_login_invalid_credentials(self):
        r = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "wrong"},
            format="json",
        )
        self.assertEqual(r.status_code, 401)

    def test_login_missing_fields(self):
        r = self.client.post("/api/auth/login/", {}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_login_then_me_then_logout(self):
        r = self.client.post(
            "/api/auth/login/",
            {"username": "alice", "password": "hunter2"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["username"], "alice")

        r = self.client.get("/api/auth/me/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["username"], "alice")

        r = self.client.post("/api/auth/logout/")
        self.assertEqual(r.status_code, 200)

        r = self.client.get("/api/auth/me/")
        self.assertEqual(r.status_code, 401)

    def test_csrf_endpoint_sets_cookie(self):
        r = self.client.get("/api/auth/csrf/")
        self.assertEqual(r.status_code, 200)
        self.assertIn("csrfToken", r.json())
        self.assertIn("csrftoken", r.cookies)
