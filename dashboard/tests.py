from django.contrib.auth.models import User
from django.test import TestCase
from django.urls import reverse


class DashboardAuthTest(TestCase):
    """All dashboard views must redirect unauthenticated users to the login page."""

    DASHBOARD_URLS = [
        "/",
        "/map/",
        "/calendar/",
        "/journeys/",
        "/postcodes/",
    ]

    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass123")

    def test_unauthenticated_redirect(self):
        """An anonymous user is redirected to the login page for every dashboard URL."""
        for url in self.DASHBOARD_URLS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 302)
                self.assertIn("/accounts/login/", response["Location"])

    def test_authenticated_access(self):
        """A logged-in user can reach every dashboard page (200 OK)."""
        self.client.login(username="testuser", password="testpass123")
        for url in self.DASHBOARD_URLS:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)

    def test_login_page_accessible(self):
        """The login page itself must be publicly accessible."""
        response = self.client.get(reverse("login"))
        self.assertEqual(response.status_code, 200)
