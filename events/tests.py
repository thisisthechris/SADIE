from unittest import skipUnless

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from organisations.models import Organisation

from .models import Category, Event, EventCategory

try:
    from django.contrib.gis.geos import Point  # noqa: F401

    _HAS_GEODJANGO = True
except Exception:
    _HAS_GEODJANGO = False


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
        Event.objects.create(organisation=self.org, title="Later Event", start_datetime=later)
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
        Event.objects.create(organisation=org2, title="Other Event", start_datetime=timezone.now())
        response = self.client.get(f"/api/events/?organisation={self.org.pk}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)


class EventCategorySourceTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organisation.objects.create(name="Source Org")
        self.music = Category.objects.create(name="Music")
        self.film = Category.objects.create(name="Film")
        self.partner_event = Event.objects.create(
            organisation=self.org, title="Partner tagged", start_datetime=timezone.now()
        )
        self.auto_event = Event.objects.create(
            organisation=self.org, title="Auto tagged", start_datetime=timezone.now()
        )

    def test_add_defaults_to_partner_source(self):
        self.partner_event.categories.add(self.music)
        link = EventCategory.objects.get(event=self.partner_event, category=self.music)
        self.assertEqual(link.source, EventCategory.Source.PARTNER)

    def test_source_from_raw_accepts_known_values_and_defaults_to_partner(self):
        self.assertEqual(EventCategory.source_from_raw("auto"), EventCategory.Source.AUTO)
        self.assertEqual(EventCategory.source_from_raw("manual"), EventCategory.Source.MANUAL)
        for value in (None, "", "bogus"):
            self.assertEqual(EventCategory.source_from_raw(value), EventCategory.Source.PARTNER)

    @skipUnless(_HAS_GEODJANGO, "scraping.services needs GeoDjango (GDAL)")
    def test_sync_categories_records_auto_source_from_raw_data(self):
        from scraping.models import ImportedEvent
        from scraping.services import _sync_categories

        imported = ImportedEvent(categories_raw=["Film", " "], raw_data={"categories_source": "auto"})
        _sync_categories(self.auto_event, imported)
        links = EventCategory.objects.filter(event=self.auto_event)
        self.assertEqual([(lnk.category.name, lnk.source) for lnk in links], [("Film", "auto")])

    def test_filter_events_by_category_source(self):
        self.partner_event.categories.add(self.music, self.film)
        self.auto_event.categories.add(self.film, through_defaults={"source": EventCategory.Source.AUTO})

        response = self.client.get("/api/events/?category_source=auto")
        self.assertEqual([e["title"] for e in response.data["results"]], ["Auto tagged"])

        response = self.client.get("/api/events/?category_source=partner")
        self.assertEqual(response.data["count"], 1)
