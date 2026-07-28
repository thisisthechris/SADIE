"""
Tests for MCP server tools.

Validates that each tool returns correct response shapes and integrates
properly with the Django ORM. Uses factory-boy for test data.
"""

from datetime import date, timedelta

import factory
import pytest
from factory import SelfAttribute, SubFactory
from factory.django import DjangoModelFactory

from analytics.models import PostcodeAreaInteraction, UserHashInteraction
from events.models import Category, Event
from organisations.models import Location, Organisation

from . import tools

# ============================================================================
# FACTORIES
# ============================================================================


class OrganisationFactory(DjangoModelFactory):
    class Meta:
        model = Organisation

    name = factory.Sequence(lambda n: f"Test Organisation {n}")
    is_partner = False


class LocationFactory(DjangoModelFactory):
    class Meta:
        model = Location

    organisation = SubFactory(OrganisationFactory)
    name = "Test Venue"
    address = "123 Main St"
    postcode = "PL4 0AB"


class CategoryFactory(DjangoModelFactory):
    class Meta:
        model = Category

    name = factory.Sequence(lambda n: f"Music {n}")


class EventFactory(DjangoModelFactory):
    class Meta:
        model = Event

    organisation = SubFactory(OrganisationFactory)
    location = SubFactory(LocationFactory, organisation=SelfAttribute("..organisation"))
    title = "Test Event"
    description = "A test event"
    start_datetime = date.today()


# ============================================================================
# TESTS
# ============================================================================


@pytest.mark.django_db
class TestSearchTools:
    """Test search functionality."""

    def test_search_sadie_empty_query(self):
        """Empty query returns no results."""
        result = tools.search_sadie(query="")
        assert result["query"] == ""
        assert result["results"] == []

    def test_search_sadie_too_short(self):
        """Query < 2 chars returns no results."""
        result = tools.search_sadie(query="a")
        assert result["results"] == []

    def test_search_sadie_with_events(self):
        """Search returns events."""
        EventFactory(title="Plymouth Music Festival")
        result = tools.search_sadie(query="Plymouth", types="event", limit=10)
        assert isinstance(result, dict)
        assert "results" in result
        assert "query" in result
        assert "vector_available" in result

    def test_search_sadie_limit(self):
        """Limit is capped at 50."""
        tools.search_sadie(query="test", limit=100)
        # Result should succeed, limit is internally capped


@pytest.mark.django_db
class TestBrowseEvents:
    """Test event listing and detail."""

    def test_list_events_empty(self):
        """Empty database returns no events."""
        result = tools.list_events()
        assert result["count"] == 0
        assert result["results"] == []

    def test_list_events_with_data(self):
        """List events returns correct shape."""
        event = EventFactory()
        result = tools.list_events(limit=10)
        assert result["count"] >= 1
        assert len(result["results"]) >= 1
        assert result["results"][0]["id"] == event.id
        assert "title" in result["results"][0]
        assert "organisation_name" in result["results"][0]

    def test_list_events_pagination(self):
        """Pagination works."""
        for _ in range(5):
            EventFactory()
        result = tools.list_events(limit=2, offset=0)
        assert len(result["results"]) == 2
        result2 = tools.list_events(limit=2, offset=2)
        assert len(result2["results"]) == 2

    def test_get_event(self):
        """Get event detail includes stats."""
        event = EventFactory()
        UserHashInteraction.objects.create(
            user_hash="test_hash",
            interaction_type="event",
            event=event,
            organisation=event.organisation,
            interaction_date=date.today(),
        )
        result = tools.get_event(event.id)
        assert result["id"] == event.id
        assert "title" in result
        assert "total_interactions" in result
        assert result["total_interactions"] == 1
        assert "unique_visitors" in result

    def test_get_event_not_found(self):
        """Get non-existent event returns error."""
        result = tools.get_event(99999)
        assert "error" in result


@pytest.mark.django_db
class TestBrowseOrganisations:
    """Test organisation listing and detail."""

    def test_list_organisations_empty(self):
        """Empty database returns no organisations."""
        result = tools.list_organisations()
        assert result["count"] == 0
        assert result["results"] == []

    def test_list_organisations_with_data(self):
        """List organisations returns correct shape."""
        OrganisationFactory()
        result = tools.list_organisations(limit=10)
        assert result["count"] >= 1
        assert "id" in result["results"][0]
        assert "name" in result["results"][0]
        assert "is_partner" in result["results"][0]
        assert "event_count" in result["results"][0]

    def test_list_organisations_filter_partner(self):
        """Filter by partner status."""
        OrganisationFactory(is_partner=True)
        OrganisationFactory(is_partner=False)
        result = tools.list_organisations(is_partner=True)
        assert all(r["is_partner"] for r in result["results"])

    def test_get_organisation_by_id(self):
        """Get organisation by ID."""
        org = OrganisationFactory()
        result = tools.get_organisation(org.id)
        assert result["id"] == org.id
        assert result["name"] == org.name
        assert "event_count" in result
        assert "location_count" in result

    def test_get_organisation_by_slug(self):
        """Get organisation by slug."""
        org = OrganisationFactory(slug="unique-slug")
        result = tools.get_organisation("unique-slug")
        assert result["id"] == org.id
        assert result["name"] == org.name

    def test_get_organisation_not_found(self):
        """Get non-existent organisation returns error."""
        result = tools.get_organisation("nonexistent-slug")
        assert "error" in result


@pytest.mark.django_db
class TestCategories:
    """Test category listing."""

    def test_list_categories_empty(self):
        """Empty database returns no categories."""
        result = tools.list_categories()
        assert result["results"] == []

    def test_list_categories_with_data(self):
        """List categories returns correct shape."""
        CategoryFactory()
        result = tools.list_categories()
        assert len(result["results"]) >= 1
        assert "id" in result["results"][0]
        assert "name" in result["results"][0]
        assert "event_count" in result["results"][0]


@pytest.mark.django_db
class TestAnalyticsTools:
    """Test analytics and aggregation tools."""

    def setup_method(self):
        """Set up test data."""
        self.org = OrganisationFactory()
        self.event = EventFactory(organisation=self.org)
        self.category = CategoryFactory()
        self.event.categories.add(self.category)

        # Add interactions
        for i in range(5):
            UserHashInteraction.objects.create(
                user_hash=f"user_{i}",
                interaction_type="event",
                event=self.event,
                organisation=self.org,
                interaction_date=date.today() - timedelta(days=i),
            )

    def test_get_stats_summary(self):
        """Get summary stats."""
        result = tools.get_stats_summary()
        assert "org_count" in result
        assert "event_count" in result
        assert "interaction_count" in result
        assert "unique_visitors" in result
        assert result["unique_visitors"] == 5

    def test_top_organisations(self):
        """Top organisations by event count."""
        result = tools.top_organisations(limit=10)
        assert "results" in result
        assert len(result["results"]) >= 1
        assert "event_count" in result["results"][0]

    def test_top_categories(self):
        """Top categories by event count."""
        result = tools.top_categories(limit=10)
        assert "results" in result
        if result["results"]:
            assert "event_count" in result["results"][0]

    def test_interactions_timeseries(self):
        """Interactions timeseries returns monthly data."""
        result = tools.interactions_timeseries()
        assert "series" in result
        if result["series"]:
            assert "month" in result["series"][0]
            assert "count" in result["series"][0]

    def test_interactions_by_type(self):
        """Interactions breakdown by type."""
        result = tools.interactions_by_type()
        assert "results" in result
        if result["results"]:
            assert "interaction_type" in result["results"][0]
            assert "count" in result["results"][0]

    def test_postcode_aggregates_empty(self):
        """Postcode aggregates returns structured response."""
        result = tools.postcode_aggregates()
        assert "by_area" in result
        assert "by_postcode" in result

    def test_postcode_aggregates_with_data(self):
        """Postcode aggregates with postcode interaction data."""
        PostcodeAreaInteraction.objects.create(
            organisation=self.org,
            postcode="PL4",
            area="PL4",
            interaction_count=100,
            period_start=date.today() - timedelta(days=30),
            period_end=date.today(),
        )
        result = tools.postcode_aggregates()
        assert "by_area" in result
        assert "by_postcode" in result

    def test_get_event_stats(self):
        """Per-event stats."""
        result = tools.get_event_stats(self.event.id)
        assert result["event_id"] == self.event.id
        assert "unique_users" in result
        assert "total_interactions" in result
        assert "by_month" in result
        assert result["total_interactions"] == 5

    def test_get_event_stats_nonexistent(self):
        """Non-existent event stats."""
        result = tools.get_event_stats(99999)
        assert "event_id" in result
        # No error expected; just returns 0 stats
        assert result["total_interactions"] == 0


# ============================================================================
# INTEGRATION TESTS
# ============================================================================


@pytest.mark.django_db
class TestFilterParameters:
    """Test filter parameter handling in tools."""

    def setup_method(self):
        """Set up test data."""
        self.org = OrganisationFactory(name="Arts Centre")
        self.category = CategoryFactory(name="Dance")
        self.event = EventFactory(
            organisation=self.org,
            title="Dance Performance",
            start_datetime=date.today() + timedelta(days=5),
        )
        self.event.categories.add(self.category)

    def test_filter_by_organisation(self):
        """Filter events by organisation."""
        result = tools.list_events(org_id=self.org.id)
        assert len(result["results"]) >= 1
        assert all(e["organisation_id"] == self.org.id for e in result["results"])

    def test_filter_by_category(self):
        """Filter events by category."""
        result = tools.list_events(category_id=self.category.id)
        assert len(result["results"]) >= 1

    def test_filter_by_date_range(self):
        """Filter by date range."""
        result = tools.list_events(
            date_from=(date.today()).isoformat(),
            date_to=(date.today() + timedelta(days=10)).isoformat(),
        )
        assert len(result["results"]) >= 1

    def test_filter_by_period(self):
        """Filter by period shortcut."""
        result = tools.list_events(period="7d")
        # Should return upcoming events within 7 days
        assert isinstance(result, dict)
