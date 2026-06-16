"""Tests for health check endpoints."""

from __future__ import annotations

from django.test import TestCase, client


class HealthCheckTests(TestCase):
    """Test liveness and readiness probes."""

    def setUp(self):
        self.client = client.Client()

    def test_live_endpoint_returns_200(self):
        """Liveness probe should return 200 when application is running."""
        response = self.client.get("/health/live/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "alive")
        self.assertEqual(data["service"], "django")

    def test_ready_endpoint_returns_200_when_healthy(self):
        """Readiness probe should return 200 when all services are ready."""
        response = self.client.get("/health/ready/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("status", data)
        self.assertIn("service", data)
        self.assertIn("checks", data)
        self.assertIn("database", data["checks"])

    def test_ready_endpoint_checks_database(self):
        """Readiness probe should check database connectivity."""
        response = self.client.get("/health/ready/")
        data = response.json()
        self.assertIn("database", data["checks"])
        self.assertEqual(data["checks"]["database"], "ok")

    def test_ready_endpoint_checks_cache(self):
        """Readiness probe should check cache connectivity."""
        response = self.client.get("/health/ready/")
        data = response.json()
        self.assertIn("cache", data["checks"])
        self.assertIn(data["checks"]["cache"], ["ok", "warning"])

    def test_live_endpoint_public_access(self):
        """Liveness probe should be accessible without authentication."""
        # Should not require any auth headers or credentials
        response = self.client.get("/health/live/")
        self.assertEqual(response.status_code, 200)

    def test_ready_endpoint_public_access(self):
        """Readiness probe should be accessible without authentication."""
        # Should not require any auth headers or credentials
        response = self.client.get("/health/ready/")
        self.assertIn(response.status_code, [200, 503])
