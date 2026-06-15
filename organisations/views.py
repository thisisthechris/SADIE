from django.db.models import Count
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Location, Organisation
from .permissions import IsOrgEditor
from .serializers import (
    LocationSerializer,
    LocationWriteSerializer,
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

    @action(detail=True, methods=["post"])
    def merge_into(self, request, slug=None):
        """
        Merge this organisation into another organisation.
        Staff-only operation. Cascades to all child orgs, locations, and events.
        Body: { "target": "<slug>" }
        """
        # Staff-only check
        if not (request.user.is_authenticated and request.user.is_staff):
            return Response(
                {"detail": "Only staff can merge organisations."},
                status=status.HTTP_403_FORBIDDEN,
            )

        source = self.get_object()
        target_slug = request.data.get("target")

        if not target_slug:
            return Response(
                {"detail": "Missing required field: 'target'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target = Organisation.objects.get(slug=target_slug)
        except Organisation.DoesNotExist:
            return Response(
                {"detail": f"Target organisation '{target_slug}' not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if source.pk == target.pk:
            return Response(
                {"detail": "Cannot merge organisation into itself"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reassign events from source to target
        from events.models import Event
        Event.objects.filter(organisation=source).update(organisation=target)

        # Reassign locations from source to target
        Location.objects.filter(organisation=source).update(organisation=target)

        # Reassign imported events from source to target
        from scraping.models import ImportedEvent
        ImportedEvent.objects.filter(matched_organisation=source).update(matched_organisation=target)

        # Reassign child organisations to target
        Organisation.objects.filter(parent=source).update(parent=target)

        # Delete source organisation
        source.delete()

        return Response(
            {"slug": target.slug, "id": target.id},
            status=status.HTTP_200_OK,
        )


class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.select_related("organisation", "parent").prefetch_related("sub_venues").all()
    permission_classes = [IsOrgEditor]
    filterset_fields = ["organisation", "postcode"]
    search_fields = ["name", "address", "postcode"]
    ordering_fields = ["name", "created_at"]

    def get_serializer_class(self):
        if self.action in ("update", "partial_update", "create"):
            return LocationWriteSerializer
        return LocationSerializer

    def get_queryset(self):
        """Filter by organisation membership if user is not staff."""
        qs = super().get_queryset()
        user = self.request.user if self.request else None
        if user and user.is_authenticated and not user.is_staff:
            # Return only locations in organisations where user is a member
            org_ids = list(
                Organisation.objects.filter(
                    id__in=user.member_organisations.values_list("id", flat=True)
                ).values_list("id", flat=True)
            )
            qs = qs.filter(organisation_id__in=org_ids)
        return qs

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Deleting locations is not supported."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"])
    def merge_into(self, request, pk=None):
        """
        Merge this location into another location.
        Staff can merge across orgs; org members restricted to same org.
        Body: { "target": <id> }
        """
        source = self.get_object()
        target_id = request.data.get("target")

        if not target_id:
            return Response(
                {"detail": "Missing required field: 'target'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            target = Location.objects.get(pk=target_id)
        except Location.DoesNotExist:
            return Response(
                {"detail": f"Target location {target_id} not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if source.pk == target.pk:
            return Response(
                {"detail": "Cannot merge location into itself"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Permission check: staff can do cross-org; org members restricted to same org
        user = request.user
        is_staff = user and user.is_authenticated and user.is_staff
        if not is_staff and source.organisation_id != target.organisation_id:
            return Response(
                {"detail": "You can only merge locations within the same organisation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Reassign events from source to target
        from events.models import Event
        Event.objects.filter(location=source).update(location=target)

        # Reassign imported events from source to target
        from scraping.models import ImportedEvent
        ImportedEvent.objects.filter(matched_location=source).update(matched_location=target)

        # Reassign any sub-venues from source to target
        Location.objects.filter(parent=source).update(parent=target)

        # Delete source location
        source.delete()

        return Response(
            {"slug": target.slug if hasattr(target, 'slug') else None, "id": target.id},
            status=status.HTTP_200_OK,
        )
