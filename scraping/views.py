"""DRF endpoints for scraping admin: imported events review queue."""
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from events.models import Event

from .models import ImportedEvent, ScrapeRun, ScrapeSource
from .serializers import (
    BulkActionSerializer,
    ImportedEventDetailSerializer,
    ImportedEventListSerializer,
    ScrapeRunSerializer,
    ScrapeSourceSerializer,
)


class IsStaffOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return request.user.is_authenticated
        return request.user.is_authenticated and request.user.is_staff


class ImportedEventViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        ImportedEvent.objects.select_related(
            "source", "matched_event", "matched_organisation", "matched_location", "reviewed_by"
        )
        .all()
    )
    permission_classes = [IsStaffOrReadOnly]
    filterset_fields = ["status", "source"]
    search_fields = ["title", "description", "venue_name", "venue_postcode", "external_id"]
    ordering_fields = ["created_at", "start_datetime", "title"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ImportedEventDetailSerializer
        return ImportedEventListSerializer

    @action(detail=False, methods=["get"], url_path="counts")
    def counts(self, request):
        """Status counts for the Kanban swimlanes."""
        from django.db.models import Count

        result = {
            r["status"]: r["n"]
            for r in ImportedEvent.objects.order_by().values("status").annotate(n=Count("id"))
        }
        # Ensure all known statuses appear.
        for s, _ in ImportedEvent.STATUS_CHOICES:
            result.setdefault(s, 0)
        return Response(result)

    @action(detail=False, methods=["post"], url_path="bulk-action")
    def bulk_action(self, request):
        s = BulkActionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ids = s.validated_data["ids"]
        act = s.validated_data["action"]
        notes = s.validated_data.get("notes", "")

        qs = ImportedEvent.objects.select_for_update().filter(pk__in=ids)
        with transaction.atomic():
            qs = list(qs)
            now = timezone.now()
            results = {"updated": 0, "imported": 0, "errors": []}
            for ie in qs:
                try:
                    if act == "approve":
                        ie.status = "approved"
                    elif act == "reject":
                        ie.status = "rejected"
                    elif act == "reset":
                        ie.status = "pending"
                    elif act == "import":
                        # Create or update the linked Event.
                        if ie.matched_event_id:
                            event = ie.matched_event
                            event.title = ie.title or event.title
                            if ie.description:
                                event.description = ie.description
                            if ie.start_datetime:
                                event.start_datetime = ie.start_datetime
                            if ie.end_datetime:
                                event.end_datetime = ie.end_datetime
                            if ie.source_url:
                                event.source_url = ie.source_url
                            if ie.image_url:
                                event.image_url = ie.image_url
                            event.save()
                        else:
                            if not ie.matched_organisation_id or not ie.start_datetime:
                                results["errors"].append(
                                    {"id": ie.id, "reason": "Need matched organisation + start_datetime"}
                                )
                                continue
                            event = Event.objects.create(
                                organisation=ie.matched_organisation,
                                location=ie.matched_location,
                                title=ie.title or "Untitled event",
                                description=ie.description or "",
                                start_datetime=ie.start_datetime,
                                end_datetime=ie.end_datetime,
                                source_url=ie.source_url or "",
                                image_url=ie.image_url or "",
                            )
                            ie.matched_event = event
                        ie.status = "imported"
                        results["imported"] += 1
                    if notes:
                        ie.review_notes = notes
                    ie.reviewed_by = request.user
                    ie.reviewed_at = now
                    ie.save()
                    results["updated"] += 1
                except Exception as exc:  # pragma: no cover - defensive
                    results["errors"].append({"id": ie.id, "reason": str(exc)})

        return Response(results, status=status.HTTP_200_OK)


class ScrapeSourceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ScrapeSource.objects.all()
    serializer_class = ScrapeSourceSerializer
    permission_classes = [IsStaffOrReadOnly]


class ScrapeRunViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ScrapeRun.objects.select_related("source").all()
    serializer_class = ScrapeRunSerializer
    permission_classes = [IsStaffOrReadOnly]
    filterset_fields = ["source", "status"]
