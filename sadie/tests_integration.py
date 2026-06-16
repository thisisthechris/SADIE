"""Integration tests for critical API endpoints."""

from __future__ import annotations

from django.contrib.auth.models import User
from django.test import TestCase, client

from organisations.models import Organisation


class AuthAPITests(TestCase):
    """Test authentication endpoints."""

    def setUp(self):
        self.client = client.Client()
        self.user = User.objects.create_user(username="testuser", ******)

    def test_login_with_valid_credentials(self):
        """User should be able to login with valid username/password."""
        response = self.client.post(
            "/api/auth/login/",
            {"username": "testuser", "password": "testpass123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["username"], "testuser")

    def test_login_with_invalid_credentials(self):
        """Login with incorrect credentials should return 401."""
        response = self.client.post(
            "/api/auth/login/",
            {"username": "testuser", "password": "wrongpass"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)

    def test_logout_endpoint(self):
        """Authenticated user should be able to logout."""
        self.client.login(username="testuser", ******)
        response = self.client.post("/api/auth/logout/")
        self.assertEqual(response.status_code, 200)

    def test_csrf_token_endpoint(self):
        """CSRF token endpoint should issue a token."""
        response = self.client.get("/api/auth/csrf/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("csrfToken", data)

    def test_me_endpoint_authenticated(self):
        """Authenticated user should see their profile."""
        self.client.login(username="testuser", ******)
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["username"], "testuser")

    def test_me_endpoint_unauthenticated(self):
        """Unauthenticated user should get 401 on /me/ endpoint."""
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 401)


class SearchAPITests(TestCase):
    """Test search endpoint."""

    def setUp(self):
        self.client = client.Client()
        self.org = Organisation.objects.create(name="Test Organisation", slug="test-org")

    def test_search_with_empty_query(self):
        """Search with empty query should return empty results."""
        response = self.client.get("/api/search/?q=")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 0)

    def test_search_with_short_query(self):
        """Search with <2 character query should return empty results."""
        response = self.client.get("/api/search/?q=a")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(len(data["results"]), 0)

    def test_search_endpoint_accessible(self):
        """Search endpoint should be publicly accessible."""
        response = self.client.get("/api/search/?q=test")
        self.assertEqual(response.status_code, 200)

    def test_search_response_structure(self):
        """Search response should have expected structure."""
        response = self.client.get("/api/search/?q=test")
        data = response.json()
        self.assertIn("query", data)
        self.assertIn("results", data)
        self.assertIn("vector", data)


class ConfigAPITests(TestCase):
    """Test config endpoint."""

    def setUp(self):
        self.client = client.Client()

    def test_config_endpoint_public(self):
        """Config endpoint should be publicly accessible."""
        response = self.client.get("/api/config/")
        self.assertEqual(response.status_code, 200)

    def test_config_contains_map_center(self):
        """Config should contain map center coordinates."""
        response = self.client.get("/api/config/")
        data = response.json()
        self.assertIn("default_map_center", data)
        self.assertIn("default_map_zoom", data)
