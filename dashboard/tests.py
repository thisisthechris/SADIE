from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class DashboardAuthTest(TestCase):
    """Tests for dashboard routing after migration to React SPA.

    Old Django dashboard views have been removed. The following is the new behavior:
    - "/" redirects to "/app/" (302 redirect)
    - Old paths ("/map/", "/calendar/", etc.) return 404 Not Found
    - React SPA at "/app/*" is publicly accessible and handles auth client-side
    """

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_root_redirects_to_app(self):
        """Root path "/" redirects to "/app/" (302 redirect)."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response["Location"], "/app/")

    def test_old_dashboard_paths_return_404(self):
        """Old dashboard URLs return 404 (not found)."""
        old_paths = ["/map/", "/calendar/", "/journeys/", "/postcodes/"]
        for url in old_paths:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 404)

    def test_react_app_accessible_unauthenticated(self):
        """React SPA at /app/ is publicly accessible (authentication handled client-side)."""
        response = self.client.get("/app/")
        self.assertEqual(response.status_code, 200)

    def test_react_app_accessible_authenticated(self):
        """React SPA at /app/ is accessible for authenticated users."""
        self.client.login(username="testuser", password="testpass123")
        response = self.client.get("/app/")
        self.assertEqual(response.status_code, 200)

    def test_login_page_accessible(self):
        """The login page itself must be publicly accessible."""
        response = self.client.get(reverse("login"))
        self.assertEqual(response.status_code, 200)
