"""Browser upload tool API.

    POST /api/uploads/                 create a batch (409 if this file was already uploaded)
    POST /api/uploads/{id}/rows/       add a chunk of PII-free rows (max 2,000)
    POST /api/uploads/{id}/complete/   finish the batch
    POST /api/uploads/{id}/undo/       remove everything the batch created
    GET  /api/uploads/?org=            recent batches
    GET  /api/uploads/organisations/   organisations the user may upload for

Members may upload for their own organisation (or its children); staff for any.
"""

from __future__ import annotations

from datetime import datetime, time

from django.db import transaction
from django.db.models import Max, Min
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from analytics.caching import invalidate_stats_cache
from analytics.journey_flows import rebuild_journey_flows
from analytics.models import (
    PostcodeAreaInteraction,
    PostcodeEventInteraction,
    PostcodeTicketPurchase,
    UserHashInteraction,
)
from organisations.models import Organisation

from .hashing import server_hash
from .models import UploadBatch
from .parsers import NormalizedBooking
from .services import ImportContext
from .upload_serializers import MAX_ROWS_PER_CHUNK, UploadBatchCreateSerializer, UploadRowSerializer

BATCH_ROW_MODELS = (UserHashInteraction, PostcodeTicketPurchase, PostcodeEventInteraction, PostcodeAreaInteraction)


def uploadable_organisations(user):
    """Organisations this user may upload data for."""
    if user.is_staff:
        return Organisation.objects.all()
    return Organisation.objects.filter(members=user) | Organisation.objects.filter(parent__members=user)


def _can_upload(user, org: Organisation) -> bool:
    return uploadable_organisations(user).filter(pk=org.pk).exists()


def _batch_json(batch: UploadBatch) -> dict:
    return {
        "id": batch.id,
        "organisation": batch.organisation_id,
        "organisation_name": batch.organisation.name,
        "uploaded_by": batch.uploaded_by.get_username() if batch.uploaded_by_id else None,
        "source_format": batch.source_format,
        "file_fingerprint": batch.file_fingerprint,
        "file_label": batch.file_label,
        "status": batch.status,
        "row_count": batch.row_count,
        "skipped_count": batch.skipped_count,
        "interaction_count": batch.interaction_count,
        "date_from": batch.date_from,
        "date_to": batch.date_to,
        "created_at": batch.created_at,
        "completed_at": batch.completed_at,
        "undone_at": batch.undone_at,
    }


def _aware(day) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min))


def _booking(row: dict) -> NormalizedBooking:
    event_dt = _aware(row["event_date"])
    return NormalizedBooking(
        org_code="",
        channel="Browser upload",
        event_title=row["event_title"],
        event_datetime=event_dt,
        postcode=row["postcode_sector"],
        user_hash=server_hash(row["client_hash"]),
        ticket_quantity=row["ticket_quantity"],
        attended_count=row["attended_count"],
        purchase_datetime=_aware(row["purchase_date"]) if row.get("purchase_date") else event_dt,
        venue_name=row.get("venue_name") or None,
        has_ticket_data=row["has_ticket_data"],
        ticket_price=row.get("ticket_price"),
    )


def _refresh_after_change() -> None:
    rebuild_journey_flows()
    invalidate_stats_cache()


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def uploads(request):
    if request.method == "GET":
        qs = UploadBatch.objects.filter(organisation__in=uploadable_organisations(request.user))
        if request.GET.get("org"):
            qs = qs.filter(organisation_id=request.GET["org"])
        qs = qs.select_related("organisation", "uploaded_by")[:50]
        return Response({"results": [_batch_json(b) for b in qs]})

    ser = UploadBatchCreateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data
    org = get_object_or_404(Organisation, pk=data["organisation"])
    if not _can_upload(request.user, org):
        return Response({"detail": "You can't upload data for this organisation."}, status=status.HTTP_403_FORBIDDEN)

    earlier = (
        UploadBatch.objects.filter(organisation=org, file_fingerprint=data["file_fingerprint"])
        .exclude(status=UploadBatch.Status.UNDONE)
        .first()
    )
    if earlier and not data["force"]:
        return Response(
            {"detail": "This file has already been uploaded.", "duplicate_of": _batch_json(earlier)},
            status=status.HTTP_409_CONFLICT,
        )

    batch = UploadBatch.objects.create(
        organisation=org,
        uploaded_by=request.user,
        source_format=data["source_format"],
        file_fingerprint=data["file_fingerprint"],
        file_label=data.get("file_label", ""),
        skipped_count=data["skipped_count"],
    )
    return Response(_batch_json(batch), status=status.HTTP_201_CREATED)


def _own_batch(request, pk: int) -> UploadBatch:
    batch = get_object_or_404(UploadBatch.objects.select_related("organisation", "uploaded_by"), pk=pk)
    if not _can_upload(request.user, batch.organisation):
        raise Http404
    return batch


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_rows(request, pk: int):
    batch = _own_batch(request, pk)
    if batch.status != UploadBatch.Status.IN_PROGRESS:
        return Response({"detail": "This upload is already finished."}, status=status.HTTP_409_CONFLICT)
    rows = request.data.get("rows") if isinstance(request.data, dict) else None
    if not isinstance(rows, list) or not rows:
        return Response({"detail": "Send a non-empty 'rows' list."}, status=status.HTTP_400_BAD_REQUEST)
    if len(rows) > MAX_ROWS_PER_CHUNK:
        return Response(
            {"detail": f"Send at most {MAX_ROWS_PER_CHUNK} rows per request."}, status=status.HTTP_400_BAD_REQUEST
        )

    ser = UploadRowSerializer(data=rows, many=True)
    if not ser.is_valid():
        errors = [{"row": i, "errors": e} for i, e in enumerate(ser.errors) if e][:20]
        return Response({"detail": "Some rows were rejected.", "rows": errors}, status=status.HTTP_400_BAD_REQUEST)

    ctx = ImportContext(organisation=batch.organisation, upload_batch=batch)
    with transaction.atomic():
        for row in ser.validated_data:
            ctx.record_booking(_booking(row))
        summary = ctx.flush()
        UploadBatch.objects.filter(pk=batch.pk).update(row_count=batch.row_count + len(rows))
    return Response({"accepted": len(rows), "interactions": summary["user_hash_interactions"]})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_complete(request, pk: int):
    batch = _own_batch(request, pk)
    if batch.status != UploadBatch.Status.IN_PROGRESS:
        return Response(_batch_json(batch))
    span = UserHashInteraction.objects.filter(upload_batch=batch).aggregate(
        lo=Min("interaction_date"), hi=Max("interaction_date")
    )
    batch.interaction_count = UserHashInteraction.objects.filter(upload_batch=batch).count()
    batch.date_from, batch.date_to = span["lo"], span["hi"]
    batch.status = UploadBatch.Status.COMPLETE
    batch.completed_at = timezone.now()
    batch.save()
    _refresh_after_change()
    return Response(_batch_json(batch))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def upload_undo(request, pk: int):
    batch = _own_batch(request, pk)
    if not (request.user.is_staff or batch.uploaded_by_id == request.user.pk):
        return Response(
            {"detail": "Only staff or the person who uploaded can undo."}, status=status.HTTP_403_FORBIDDEN
        )
    if batch.status == UploadBatch.Status.UNDONE:
        return Response(_batch_json(batch))
    with transaction.atomic():
        for model in BATCH_ROW_MODELS:
            model.objects.filter(upload_batch=batch).delete()
        batch.status = UploadBatch.Status.UNDONE
        batch.undone_at = timezone.now()
        batch.save()
    _refresh_after_change()
    return Response(_batch_json(batch))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def upload_organisations(request):
    """Organisations the current user can upload for (for the org picker)."""
    orgs = uploadable_organisations(request.user).distinct().order_by("name").values("id", "name")
    return Response({"results": list(orgs)})
