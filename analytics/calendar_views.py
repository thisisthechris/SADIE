"""Data calendar: which of the last N weeks each organisation has data for.

    GET /api/analytics/data-calendar/?org=<id>&weeks=52
        One organisation (members of that org, or staff).
    GET /api/analytics/data-calendar/?weeks=52
        Staff only: every partner organisation, for the coverage overview.

Weeks run Monday to Sunday and end with the last complete week. A week with no
interactions and no ticket purchases is a gap.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Sum
from django.db.models.functions import TruncWeek
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from imports.models import UploadBatch
from imports.upload_views import uploadable_organisations
from organisations.models import Organisation

from .models import PostcodeTicketPurchase, UserHashInteraction
from .queries import last_complete_week


def _as_date(value) -> date:
    return value.date() if hasattr(value, "date") else value


def _week_counts(qs, date_field: str, value) -> dict[date, int]:
    rows = qs.annotate(week=TruncWeek(date_field)).values("week").annotate(n=value).values_list("week", "n")
    return {_as_date(week): n or 0 for week, n in rows if week}


def calendar_for(org_ids: list[int], start: date, end: date, n_weeks: int) -> list[dict]:
    interactions = _week_counts(
        UserHashInteraction.objects.filter(
            organisation_id__in=org_ids, interaction_date__gte=start, interaction_date__lte=end
        ),
        "interaction_date",
        Count("id"),
    )
    tickets = _week_counts(
        PostcodeTicketPurchase.objects.filter(
            organisation_id__in=org_ids, purchase_date__gte=start, purchase_date__lte=end
        ),
        "purchase_date",
        Sum("ticket_quantity"),
    )
    batches: dict[date, int] = {}
    for b in UploadBatch.objects.filter(organisation_id__in=org_ids, status=UploadBatch.Status.COMPLETE).exclude(
        date_from=None
    ):
        week = max(start, b.date_from - timedelta(days=b.date_from.weekday()))
        while week <= min(end, b.date_to):
            batches[week] = batches.get(week, 0) + 1
            week += timedelta(weeks=1)

    weeks = []
    for i in range(n_weeks):
        week = start + timedelta(weeks=i)
        n_int, n_tix = interactions.get(week, 0), tickets.get(week, 0)
        weeks.append(
            {
                "week_start": week.isoformat(),
                "interactions": n_int,
                "tickets": n_tix,
                "uploads": batches.get(week, 0),
                "gap": n_int == 0 and n_tix == 0,
            }
        )
    return weeks


def _summary(weeks: list[dict]) -> dict:
    gaps = [w for w in weeks if w["gap"]]
    covered = [w for w in weeks if not w["gap"]]
    return {
        "weeks_with_data": len(covered),
        "gap_weeks": len(gaps),
        "last_week_with_data": covered[-1]["week_start"] if covered else None,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def data_calendar(request):
    try:
        n_weeks = max(1, min(int(request.GET.get("weeks", "52")), 104))
    except ValueError:
        n_weeks = 52
    last_start, end = last_complete_week()
    start = last_start - timedelta(weeks=n_weeks - 1)
    meta = {"week_from": start.isoformat(), "week_to": end.isoformat(), "weeks": n_weeks}

    org_param = request.GET.get("org")
    if org_param:
        try:
            org = uploadable_organisations(request.user).distinct().get(pk=int(org_param))
        except (ValueError, Organisation.DoesNotExist):
            return Response({"detail": "Organisation not found."}, status=status.HTTP_404_NOT_FOUND)
        weeks = calendar_for([org.pk], start, end, n_weeks)
        org_json = {"id": org.pk, "name": org.name}
        return Response({**meta, "organisation": org_json, **_summary(weeks), "calendar": weeks})

    if not request.user.is_staff:
        return Response({"detail": "Pass ?org= for your organisation."}, status=status.HTTP_403_FORBIDDEN)
    rows = []
    for org in Organisation.objects.filter(is_partner=True).order_by("name"):
        weeks = calendar_for([org.pk], start, end, n_weeks)
        rows.append({"organisation": {"id": org.pk, "name": org.name}, **_summary(weeks), "calendar": weeks})
    return Response({**meta, "results": rows})
