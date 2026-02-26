from django.test import TestCase
from django.contrib.gis.geos import Point
from rest_framework.test import APIClient
from .models import Organisation, Location


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
        self.location = Location.objects.create(
            organisation=self.org,
            name="Main Gallery",
            address="1 Art Street",
            postcode="EC1A 1BB",
            point=Point(-0.1, 51.5),
        )

    def test_str(self):
        self.assertEqual(str(self.location), "Main Gallery (Arts Org)")

    def test_point_field(self):
        self.assertAlmostEqual(self.location.point.x, -0.1)
        self.assertAlmostEqual(self.location.point.y, 51.5)


class OrganisationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Gallery One", website="https://gallery.example.com")

    def test_list_organisations(self):
        response = self.client.get("/api/organisations/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_retrieve_organisation(self):
        response = self.client.get(f"/api/organisations/{self.org.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Gallery One")
