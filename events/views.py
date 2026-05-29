import django_filters
from django.db.models import Count
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly

from .models import Category, Event
from .serializers import CategorySerializer, EventDetailSerializer, EventSerializer


class EventFilter(django_filters.FilterSet):
    start_after = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="gte")
    start_before = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="lte")
    category = django_filters.NumberFilter(field_name="categories__id")

    # Aliases matching the SPA filter store schema (org, date_from, date_to, period)
    org = django_filters.NumberFilter(field_name="organisation")
    date_from = django_filters.DateFilter(field_name="start_datetime", lookup_expr="date__gte")
    date_to = django_filters.DateFilter(field_name="start_datetime", lookup_expr="date__lte")
    period = django_filters.CharFilter(method="filter_period")

    def filter_period(self, queryset, name, value):
        from datetime import date, timedelta

        PERIOD_DAYS = {"7d": 7, "30d": 30, "90d": 90, "1y": 365}
        days = PERIOD_DAYS.get(value)
        if days is not None and not self.data.get("date_from"):
            cutoff = date.today() - timedelta(days=days)
            queryset = queryset.filter(start_datetime__date__gte=cutoff)
        return queryset

    class Meta:
        model = Event
        fields = ["organisation", "location", "start_after", "start_before", "category"]


class EventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        Event.objects.select_related("organisation", "location")
        .prefetch_related("categories")
        .all()
    )
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_class = EventFilter
    search_fields = ["title", "description", "organisation__name"]
    ordering_fields = ["start_datetime", "created_at", "title"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return EventDetailSerializer
        return EventSerializer


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.annotate(event_count=Count("events")).order_by("name")
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    search_fields = ["name"]
    ordering_fields = ["name", "event_count"]
