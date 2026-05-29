"""
Journeys analytics endpoint.

Returns the same five sections as the legacy ``dashboard/journeys.html``
page so the SPA can render them with the existing filter bar:

    monthly        list[{month: ISO date | None, count: int}]
    type_breakdown list[{interaction_type: str, n: int}]
    unique_users   list[{organisation: str, unique_users: int}]
    top_users      list[{user_hash: str, n: int}]   # short hash, not PII
    cross_tab      list[{organisation: str, interaction_type: str, count: int}]

All filters from ``analytics.queries.parse_filter_params`` are honoured.
"""

from __future__ import annotations

from django.db.models import Count
from django.db.models.functions import TruncMonth
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .queries import interactions_qs, parse_filter_params


def _short_hash(h: str | None) -> str:
    if not h:
        return ""
    return h[:8]


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def journeys_summary(request: Request) -> Response:
    p = parse_filter_params(request)
    interactions = interactions_qs(p)

    monthly_qs = (
        interactions.annotate(month=TruncMonth("interaction_date"))
        .values("month")
        .annotate(count=Count("id"))
        .order_by("month")
    )
    monthly = [
        {
            "month": (
                row["month"].date().isoformat()
                if hasattr(row["month"], "date")
                else (row["month"].isoformat() if row["month"] else None)
            ),
            "count": row["count"],
        }
        for row in monthly_qs
    ]

    type_breakdown = list(interactions.values("interaction_type").annotate(n=Count("id")).order_by("-n"))

    unique_users = list(
        interactions.values("organisation__name")
        .annotate(unique_users=Count("user_hash", distinct=True))
        .order_by("-unique_users")
    )
    unique_users = [
        {"organisation": r["organisation__name"] or "—", "unique_users": r["unique_users"]} for r in unique_users
    ]

    top_users_qs = interactions.values("user_hash").annotate(n=Count("id")).order_by("-n")[:10]
    top_users = [{"user_hash": _short_hash(r["user_hash"]), "n": r["n"]} for r in top_users_qs]

    cross_tab = list(
        interactions.values("organisation__name", "interaction_type")
        .annotate(count=Count("id"))
        .order_by("organisation__name", "interaction_type")
    )
    cross_tab = [
        {
            "organisation": r["organisation__name"] or "—",
            "interaction_type": r["interaction_type"],
            "count": r["count"],
        }
        for r in cross_tab
    ]

    return Response(
        {
            "filters": {k: v for k, v in p.items() if v not in (None, "")},
            "totals": {
                "interactions": interactions.count(),
                "unique_users": interactions.values("user_hash").distinct().count(),
            },
            "monthly": monthly,
            "type_breakdown": type_breakdown,
            "unique_users_by_org": unique_users,
            "top_users": top_users,
            "cross_tab": cross_tab,
        }
    )
