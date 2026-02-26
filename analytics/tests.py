from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from events.models import Event
from organisations.models import Organisation

from .models import PostcodeAreaInteraction, UserHashInteraction


def make_org(name="Test Org"):
    return Organisation.objects.create(name=name)


class UserHashInteractionModelTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.event = Event.objects.create(
            organisation=self.org,
            title="Test Event",
            start_datetime=timezone.now(),
        )
        self.interaction = UserHashInteraction.objects.create(
            user_hash="a" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )

    def test_str_contains_hash_prefix(self):
        self.assertIn("aaaaaaaa", str(self.interaction))

    def test_ordering_newest_first(self):
        yesterday = (timezone.now() - timezone.timedelta(days=1)).date()
        UserHashInteraction.objects.create(
            user_hash="b" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=yesterday,
        )
        first = UserHashInteraction.objects.first()
        self.assertEqual(first, self.interaction)


class PostcodeAreaInteractionModelTest(TestCase):
    def setUp(self):
        self.org = make_org()
        self.record = PostcodeAreaInteraction.objects.create(
            organisation=self.org,
            postcode="EC1A",
            area="Islington",
            interaction_count=10,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
        )

    def test_str(self):
        s = str(self.record)
        self.assertIn("EC1A", s)
        self.assertIn("Test Org", s)


class AnalyticsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = make_org()
        self.event = Event.objects.create(
            organisation=self.org,
            title="Event",
            start_datetime=timezone.now(),
        )
        UserHashInteraction.objects.create(
            user_hash="c" * 64,
            interaction_type="event",
            event=self.event,
            organisation=self.org,
            interaction_date=timezone.now().date(),
        )
        PostcodeAreaInteraction.objects.create(
            organisation=self.org,
            postcode="W1A",
            area="Westminster",
            interaction_count=5,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
        )

    def test_list_interactions(self):
        response = self.client.get("/api/analytics/interactions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_list_postcodes(self):
        response = self.client.get("/api/analytics/postcodes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_upload_interaction_requires_token(self):
        response = self.client.post(
            "/api/upload/interactions/",
            data=[
                {
                    "user_hash": "d" * 64,
                    "interaction_type": "event",
                    "organisation": self.org.pk,
                    "event": self.event.pk,
                    "interaction_date": str(timezone.now().date()),
                }
            ],
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_upload_interaction_with_token(self):
        from django.conf import settings

        self.client.credentials(HTTP_X_UPLOAD_TOKEN=settings.UPLOAD_API_TOKEN)
        response = self.client.post(
            "/api/upload/interactions/",
            data=[
                {
                    "user_hash": "e" * 64,
                    "interaction_type": "event",
                    "organisation": self.org.pk,
                    "event": self.event.pk,
                    "interaction_date": str(timezone.now().date()),
                }
            ],
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["created"], 1)
