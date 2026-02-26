from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from django_filters.rest_framework import DjangoFilterBackend
import django_filters
from .models import Event
from .serializers import EventSerializer, EventDetailSerializer


class EventFilter(django_filters.FilterSet):
    start_after = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="gte")
    start_before = django_filters.DateTimeFilter(field_name="start_datetime", lookup_expr="lte")

    class Meta:
        model = Event
        fields = ["organisation", "location", "start_after", "start_before"]


class EventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Event.objects.select_related("organisation", "location").all()
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_class = EventFilter
    search_fields = ["title", "description", "organisation__name"]
    ordering_fields = ["start_datetime", "created_at", "title"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return EventDetailSerializer
        return EventSerializer
