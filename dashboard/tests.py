from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class DashboardAuthTest(TestCase):
    """Tests for Django-level routing after the SPA moved to its own nginx container.

    The React SPA (including "/" and any legacy "/app/*" links) is now served and
    routed by the nginx front-door container, NOT by Django. At the Django layer:
    - "/" and "/app/" are no longer routes and return 404.
    - Old dashboard paths ("/map/", "/calendar/", etc.) return 404.
    - The auth login page remains served by Django.
    """

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_root_not_served_by_django(self):
        """Django no longer serves the SPA shell at "/"; nginx owns the root."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 404)

    def test_old_dashboard_paths_return_404(self):
        """Old dashboard URLs return 404 (not found)."""
        old_paths = ["/map/", "/calendar/", "/journeys/", "/postcodes/"]
        for url in old_paths:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 404)

    def test_app_prefix_not_served_by_django(self):
        """Django no longer serves the SPA at "/app/"; nginx redirects it to root."""
        response = self.client.get("/app/")
        self.assertEqual(response.status_code, 404)

    def test_login_page_accessible(self):
        """The login page itself must be publicly accessible."""
        response = self.client.get(reverse("login"))
        self.assertEqual(response.status_code, 200)
