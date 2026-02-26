from django.db.models import Count
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from .models import Organisation, Location
from .serializers import OrganisationSerializer, OrganisationListSerializer, LocationSerializer


class OrganisationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Organisation.objects.annotate(
        location_count=Count("locations", distinct=True),
        event_count=Count("events", distinct=True),
    ).prefetch_related("locations").order_by("name")
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["name"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.action == "list":
            return OrganisationListSerializer
        return OrganisationSerializer


class LocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Location.objects.select_related("organisation").all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["organisation", "postcode"]
    search_fields = ["name", "address", "postcode"]
    ordering_fields = ["name", "created_at"]
