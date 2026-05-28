from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Location, Organisation
from .permissions import IsOrgEditor
from .serializers import (
    LocationSerializer,
    OrganisationListSerializer,
    OrganisationSerializer,
    OrganisationWriteSerializer,
)


class OrganisationViewSet(viewsets.ModelViewSet):
    queryset = (
        Organisation.objects.annotate(
            location_count=Count("locations", distinct=True),
            event_count=Count("events", distinct=True),
            member_count=Count("members", distinct=True),
        )
        .select_related("parent")
        .prefetch_related("locations", "members", "children")
    )
    permission_classes = [IsOrgEditor]
    lookup_field = "slug"
    lookup_value_regex = "[^/]+"
    filterset_fields = ["name", "is_partner", "parent"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at", "is_partner"]

    def get_serializer_class(self):
        if self.action == "list":
            return OrganisationListSerializer
        if self.action in ("update", "partial_update", "create"):
            return OrganisationWriteSerializer
        return OrganisationSerializer

    def create(self, request, *args, **kwargs):
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response(
                {"detail": "Only staff can create organisations."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Deleting organisations is not supported."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class LocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Location.objects.select_related("organisation").all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
    filterset_fields = ["organisation", "postcode"]
    search_fields = ["name", "address", "postcode"]
    ordering_fields = ["name", "created_at"]
