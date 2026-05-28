"""Tests for Phase 4 SavedView API + short link redirect."""
from django.contrib.auth.models import User
from django.test import TestCase

from dashboard.models import SavedView


class SavedViewAPITest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice", password="x")
        self.bob = User.objects.create_user("bob", password="x")

    def _login(self, user):
        self.client.login(username=user.username, password="x")

    def test_create_and_list_mine(self):
        self._login(self.alice)
        r = self.client.post(
            "/api/views/",
            {"name": "My map", "path": "/app/map3d", "query_string": "org=1", "is_public": False},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        slug = r.json()["slug"]
        self.assertTrue(slug)

        r = self.client.get("/api/views/mine/")
        self.assertEqual(r.status_code, 200)
        names = [v["name"] for v in r.json()["results"]]
        self.assertIn("My map", names)

    def test_owner_only_edit(self):
        sv = SavedView.objects.create(user=self.alice, name="A", path="/app/", query_string="")
        self._login(self.bob)
        r = self.client.patch(
            f"/api/views/{sv.slug}/", {"name": "Hacked"}, content_type="application/json"
        )
        self.assertIn(r.status_code, (403, 404))
        sv.refresh_from_db()
        self.assertEqual(sv.name, "A")

    def test_public_visible_to_others(self):
        sv = SavedView.objects.create(
            user=self.alice, name="Public", path="/app/", query_string="", is_public=True
        )
        self._login(self.bob)
        r = self.client.get(f"/api/views/{sv.slug}/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["is_owner"])

    def test_private_hidden_from_others(self):
        sv = SavedView.objects.create(user=self.alice, name="Priv", path="/app/", query_string="")
        self._login(self.bob)
        r = self.client.get(f"/api/views/{sv.slug}/")
        self.assertEqual(r.status_code, 404)

    def test_short_link_redirects_to_spa(self):
        sv = SavedView.objects.create(
            user=self.alice, name="P", path="/app/map", query_string="org=2", is_public=True
        )
        r = self.client.get(f"/v/{sv.slug}/")
        self.assertEqual(r.status_code, 302)
        self.assertEqual(r["Location"], f"/app/v/{sv.slug}/")

    def test_short_link_private_redirects_to_login(self):
        sv = SavedView.objects.create(user=self.alice, name="P2", path="/app/", query_string="")
        r = self.client.get(f"/v/{sv.slug}/")
        self.assertEqual(r.status_code, 302)
        self.assertIn("/login/", r["Location"])

    def test_unique_per_user_name(self):
        SavedView.objects.create(user=self.alice, name="Same", path="/", query_string="")
        # Same name by alice fails…
        self._login(self.alice)
        r = self.client.post(
            "/api/views/",
            {"name": "Same", "path": "/", "query_string": "", "is_public": False},
            content_type="application/json",
        )
        self.assertEqual(r.status_code, 400)
        # …but bob can reuse it.
        SavedView.objects.create(user=self.bob, name="Same", path="/", query_string="")
