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


class UsersSearchEndpointTest(TestCase):
    """Tests for the staff-only /api/auth/users/ autocomplete endpoint."""

    def setUp(self):
        self.client = APIClient()
        self.staff = User.objects.create_user("staffer", password="pw", is_staff=True)
        self.regular = User.objects.create_user("alice", password="pw")
        User.objects.create_user(
            "bob.jones", password="pw", email="bob.jones@example.com", first_name="Bob", last_name="Jones"
        )

    def test_anonymous_is_403(self):
        # IsAuthenticated + SessionAuthentication (no Basic) -> DRF returns 403,
        # not 401, since there's no auth challenge to issue.
        r = self.client.get("/api/auth/users/")
        self.assertEqual(r.status_code, 403)

    def test_non_staff_is_403(self):
        self.client.force_authenticate(self.regular)
        r = self.client.get("/api/auth/users/")
        self.assertEqual(r.status_code, 403)

    def test_staff_can_list_users(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get("/api/auth/users/")
        self.assertEqual(r.status_code, 200)
        usernames = {u["username"] for u in r.json()["results"]}
        self.assertIn("alice", usernames)
        self.assertIn("bob.jones", usernames)
        self.assertIn("staffer", usernames)

    def test_search_filters_by_username(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get("/api/auth/users/", {"search": "alice"})
        self.assertEqual(r.status_code, 200)
        usernames = {u["username"] for u in r.json()["results"]}
        self.assertEqual(usernames, {"alice"})

    def test_search_filters_by_email_and_name(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get("/api/auth/users/", {"search": "bob.jones@example.com"})
        self.assertEqual({u["username"] for u in r.json()["results"]}, {"bob.jones"})

        r = self.client.get("/api/auth/users/", {"search": "Jones"})
        self.assertEqual({u["username"] for u in r.json()["results"]}, {"bob.jones"})

    def test_search_no_match_returns_empty(self):
        self.client.force_authenticate(self.staff)
        r = self.client.get("/api/auth/users/", {"search": "nonexistent-user-xyz"})
        self.assertEqual(r.json()["results"], [])

    def test_results_capped_at_20(self):
        self.client.force_authenticate(self.staff)
        for i in range(25):
            User.objects.create_user(f"bulkuser{i}", password="pw")
        r = self.client.get("/api/auth/users/")
        self.assertLessEqual(len(r.json()["results"]), 20)


class CreateAccountEndpointTest(TestCase):
    """Tests for the staff-only /api/auth/accounts/ account-creation endpoint."""

    def setUp(self):
        from organisations.models import Organisation

        self.client = APIClient()
        self.staff = User.objects.create_user("staffer", password="pw", is_staff=True)
        self.superuser = User.objects.create_user("super", password="pw", is_staff=True, is_superuser=True)
        self.regular = User.objects.create_user("alice", password="pw")
        self.org = Organisation.objects.create(name="Test Org")

    def _payload(self, **overrides):
        payload = {
            "username": "newperson",
            "email": "newperson@example.com",
            "first_name": "New",
            "last_name": "Person",
            "password": "a-very-unguessable-pw-987",
            "organisation_ids": [self.org.id],
        }
        payload.update(overrides)
        return payload

    def test_anonymous_is_403(self):
        r = self.client.post("/api/auth/accounts/", self._payload(), format="json")
        self.assertEqual(r.status_code, 403)

    def test_non_staff_is_403(self):
        self.client.force_authenticate(self.regular)
        r = self.client.post("/api/auth/accounts/", self._payload(), format="json")
        self.assertEqual(r.status_code, 403)

    def test_staff_can_create_account_and_assign_org(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", self._payload(), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        user = User.objects.get(username="newperson")
        self.assertTrue(user.check_password("a-very-unguessable-pw-987"))
        self.assertFalse(user.is_staff)
        self.assertIn(self.org, user.member_organisations.all())

    def test_missing_required_fields_is_400(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", {"username": "onlyusername"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_duplicate_username_is_400(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", self._payload(username="staffer"), format="json")
        self.assertEqual(r.status_code, 400)

    def test_weak_password_is_rejected(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", self._payload(password="password"), format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(User.objects.filter(username="newperson").exists())

    def test_non_superuser_staff_cannot_grant_is_staff(self):
        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", self._payload(is_staff=True), format="json")
        self.assertEqual(r.status_code, 403)
        self.assertFalse(User.objects.filter(username="newperson").exists())

    def test_superuser_can_grant_is_staff(self):
        self.client.force_authenticate(self.superuser)
        r = self.client.post("/api/auth/accounts/", self._payload(is_staff=True), format="json")
        self.assertEqual(r.status_code, 201, r.content)
        self.assertTrue(User.objects.get(username="newperson").is_staff)

    def test_notification_email_sent_without_password(self):
        from django.core import mail

        self.client.force_authenticate(self.staff)
        r = self.client.post("/api/auth/accounts/", self._payload(), format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ["newperson@example.com"])
        self.assertNotIn("a-very-unguessable-pw-987", sent.body)
        self.assertNotIn("a-very-unguessable-pw-987", sent.subject)
        self.assertIn("password_reset", sent.body)
