from django.test import TestCase
from rest_framework.test import APIClient

from .models import _HAS_GIS, Location, Organisation

try:
    from django.contrib.gis.geos import Point
except Exception:
    Point = None


class OrganisationModelTest(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(
            name="Test Arts Centre",
            website="https://example.com",
            description="A test arts organisation",
        )

    def test_str(self):
        self.assertEqual(str(self.org), "Test Arts Centre")

    def test_ordering(self):
        Organisation.objects.create(name="Alpha Arts")
        orgs = list(Organisation.objects.values_list("name", flat=True))
        self.assertEqual(orgs[0], "Alpha Arts")


class LocationModelTest(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Arts Org")
        point_value = Point(-0.1, 51.5) if Point else "-0.1,51.5"
        self.location = Location.objects.create(
            organisation=self.org,
            name="Main Gallery",
            address="1 Art Street",
            postcode="EC1A 1BB",
            point=point_value,
        )

    def test_str(self):
        self.assertEqual(str(self.location), "Main Gallery (Arts Org)")

    def test_point_field(self):
        if _HAS_GIS and Point:
            self.assertAlmostEqual(self.location.point.x, -0.1)
            self.assertAlmostEqual(self.location.point.y, 51.5)
        else:
            self.assertIsNotNone(self.location.point)


class OrganisationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Gallery One", website="https://gallery.example.com")

    def test_list_organisations(self):
        response = self.client.get("/api/organisations/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_retrieve_organisation(self):
        response = self.client.get(f"/api/organisations/{self.org.slug}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Gallery One")
        self.assertIn("can_edit", response.data)
        self.assertIn("is_partner", response.data)


class OrganisationPartnerHierarchyTest(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        self.staff = User.objects.create_user("admin", password="x", is_staff=True)
        self.member = User.objects.create_user("alice", password="x")
        self.outsider = User.objects.create_user("bob", password="x")
        self.parent = Organisation.objects.create(name="Parent Org")
        self.child = Organisation.objects.create(name="Child Org", parent=self.parent)
        self.parent.members.add(self.member)
        self.client = APIClient()

    def test_default_ordering_partners_first(self):
        Organisation.objects.create(name="Zeta", is_partner=True)
        names = list(Organisation.objects.values_list("name", flat=True))
        self.assertEqual(names[0], "Zeta")

    def test_clean_rejects_self_parent(self):
        from django.core.exceptions import ValidationError

        self.parent.parent = self.parent
        with self.assertRaises(ValidationError):
            self.parent.clean()

    def test_clean_rejects_grandchild(self):
        from django.core.exceptions import ValidationError

        grand = Organisation(name="Grand", parent=self.child)
        with self.assertRaises(ValidationError):
            grand.clean()

    def test_unauthenticated_cannot_edit(self):
        r = self.client.patch(
            f"/api/organisations/{self.parent.slug}/", {"name": "Hacked"}, format="json"
        )
        self.assertIn(r.status_code, (401, 403))

    def test_outsider_cannot_edit(self):
        self.client.force_authenticate(self.outsider)
        r = self.client.patch(
            f"/api/organisations/{self.parent.slug}/", {"name": "Nope"}, format="json"
        )
        self.assertEqual(r.status_code, 403)

    def test_member_can_edit_basic_fields(self):
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            f"/api/organisations/{self.parent.slug}/",
            {"name": "Renamed", "description": "new"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.parent.refresh_from_db()
        self.assertEqual(self.parent.name, "Renamed")

    def test_member_cannot_set_partner(self):
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            f"/api/organisations/{self.parent.slug}/",
            {"is_partner": True},
            format="json",
        )
        self.assertEqual(r.status_code, 400)
        self.parent.refresh_from_db()
        self.assertFalse(self.parent.is_partner)

    def test_staff_can_set_partner(self):
        self.client.force_authenticate(self.staff)
        r = self.client.patch(
            f"/api/organisations/{self.parent.slug}/",
            {"is_partner": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.parent.refresh_from_db()
        self.assertTrue(self.parent.is_partner)

    def test_parent_member_can_edit_child(self):
        self.client.force_authenticate(self.member)
        r = self.client.patch(
            f"/api/organisations/{self.child.slug}/",
            {"name": "Child Renamed"},
            format="json",
        )
        self.assertEqual(r.status_code, 200, r.content)

    def test_can_edit_flag(self):
        self.client.force_authenticate(self.member)
        r = self.client.get(f"/api/organisations/{self.parent.slug}/")
        self.assertTrue(r.data["can_edit"])
        self.client.force_authenticate(self.outsider)
        r = self.client.get(f"/api/organisations/{self.parent.slug}/")
        self.assertFalse(r.data["can_edit"])

    def test_destroy_disabled(self):
        self.client.force_authenticate(self.staff)
        r = self.client.delete(f"/api/organisations/{self.parent.slug}/")
        self.assertEqual(r.status_code, 405)

    def test_org_and_descendants_helper(self):
        from organisations.models import org_and_descendants_ids

        ids = org_and_descendants_ids(self.parent.pk)
        self.assertIn(self.parent.pk, ids)
        self.assertIn(self.child.pk, ids)
        self.assertEqual(org_and_descendants_ids(self.child.pk), [self.child.pk])

    def test_create_requires_staff(self):
        self.client.force_authenticate(self.member)
        r = self.client.post(
            "/api/organisations/", {"name": "NewOne"}, format="json"
        )
        self.assertEqual(r.status_code, 403)


class AnalyticsRollupTest(TestCase):
    def setUp(self):
        from datetime import datetime, timezone

        from events.models import Event

        self.parent = Organisation.objects.create(name="ParentRollup")
        self.child = Organisation.objects.create(name="ChildRollup", parent=self.parent)
        self.other = Organisation.objects.create(name="OtherOrg")
        now = datetime(2025, 1, 1, 12, 0, tzinfo=timezone.utc)
        Event.objects.create(organisation=self.parent, title="P1", start_datetime=now)
        Event.objects.create(organisation=self.child, title="C1", start_datetime=now)
        Event.objects.create(organisation=self.other, title="O1", start_datetime=now)

    def test_events_qs_rolls_up_to_children(self):
        from analytics.queries import events_qs

        qs = events_qs({"org": str(self.parent.pk)})
        titles = sorted(qs.values_list("title", flat=True))
        self.assertEqual(titles, ["C1", "P1"])

    def test_events_qs_child_only_when_child_id(self):
        from analytics.queries import events_qs

        qs = events_qs({"org": str(self.child.pk)})
        self.assertEqual(list(qs.values_list("title", flat=True)), ["C1"])

