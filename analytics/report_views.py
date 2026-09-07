"""Views for the PDF report digest subscription + on-demand download."""

from __future__ import annotations

from datetime import date, timedelta

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from organisations.models import Organisation
from organisations.permissions import is_org_editor

from .models import OrgReportSubscription
from .reports import render_org_report_pdf


def _serialize_subscription(sub: OrgReportSubscription) -> dict:
    return {
        "organisation": sub.organisation_id,
        "frequency": sub.frequency,
        "weekday": sub.weekday,
        "day_of_month": sub.day_of_month,
        "last_sent_at": sub.last_sent_at.isoformat() if sub.last_sent_at else None,
    }


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticatedOrReadOnly])
def report_subscription(request, org_id: int) -> Response:
    """GET/PATCH an organisation's digest cadence. Read for anyone
    authenticated; write for staff or members of the org (or its parent)."""
    org = get_object_or_404(Organisation, pk=org_id)
    sub, _ = OrgReportSubscription.objects.get_or_create(organisation=org)
    if request.method == "GET":
        return Response(_serialize_subscription(sub))

    if not is_org_editor(request.user, org):
        return Response({"detail": "Only staff or org members can change this."}, status=403)

    frequency = request.data.get("frequency")
    if frequency is not None:
        if frequency not in dict(OrgReportSubscription.FREQUENCY_CHOICES):
            return Response({"detail": "Invalid frequency."}, status=400)
        sub.frequency = frequency
    if "weekday" in request.data:
        try:
            sub.weekday = max(0, min(6, int(request.data["weekday"])))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid weekday."}, status=400)
    if "day_of_month" in request.data:
        try:
            sub.day_of_month = max(1, min(28, int(request.data["day_of_month"])))
        except (TypeError, ValueError):
            return Response({"detail": "Invalid day_of_month."}, status=400)
    sub.save()
    return Response(_serialize_subscription(sub))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_org_report(request, org_id: int) -> HttpResponse | Response:
    """On-demand PDF download — defaults to the trailing 30 days."""
    org = get_object_or_404(Organisation, pk=org_id)
    try:
        period_end = (
            date.fromisoformat(request.GET["date_to"]) if request.GET.get("date_to") else date.today()
        )
        period_start = (
            date.fromisoformat(request.GET["date_from"])
            if request.GET.get("date_from")
            else period_end - timedelta(days=29)
        )
    except ValueError:
        return Response({"detail": "Invalid date_from/date_to — expected YYYY-MM-DD."}, status=400)

    pdf_bytes = render_org_report_pdf(org, period_start, period_end)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{org.slug}-report.pdf"'
    return response
