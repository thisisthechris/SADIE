from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from organisations.models import Organisation, Location
from .models import Event


class EventModelTest(TestCase):
    def setUp(self):
        self.org = Organisation.objects.create(name="Arts Centre")
        self.event = Event.objects.create(
            organisation=self.org,
            title="Opening Night",
            start_datetime=timezone.now(),
        )

    def test_str(self):
        self.assertEqual(str(self.event), "Opening Night - Arts Centre")

    def test_ordering(self):
        later = timezone.now() + timezone.timedelta(days=1)
        Event.objects.create(
            organisation=self.org, title="Later Event", start_datetime=later
        )
        titles = list(Event.objects.values_list("title", flat=True))
        self.assertEqual(titles[0], "Opening Night")


class EventAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Test Org")
        self.event = Event.objects.create(
            organisation=self.org,
            title="Test Event",
            start_datetime=timezone.now(),
        )

    def test_list_events(self):
        response = self.client.get("/api/events/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_retrieve_event(self):
        response = self.client.get(f"/api/events/{self.event.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "Test Event")

    def test_filter_by_organisation(self):
        org2 = Organisation.objects.create(name="Other Org")
        Event.objects.create(
            organisation=org2, title="Other Event", start_datetime=timezone.now()
        )
        response = self.client.get(f"/api/events/?organisation={self.org.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
