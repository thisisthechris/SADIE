"""Unified hybrid search endpoint.

Combines three signals per row:
  * Postgres full-text search rank (``ts_rank``)
  * Trigram similarity (``pg_trgm``) on title/name
  * Cosine similarity vs the query embedding (pgvector ``<=>``)

Final score = 0.45 * fts + 0.25 * trigram + 0.30 * (1 - cosine_distance).

If the embedding provider can't produce a vector (e.g. fastembed not loaded)
we silently drop the vector term and use FTS + trigram only.
"""

from __future__ import annotations

import logging
from typing import Iterable

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F, FloatField, Value
from django.db.models.expressions import RawSQL
from django.db.models.functions import Coalesce, Greatest
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from embeddings.services import get_provider
from events.models import Event
from organisations.models import Organisation


logger = logging.getLogger(__name__)

# Score-blend weights (sum to 1.0).
W_FTS = 0.45
W_TRGM = 0.25
W_VEC = 0.30


def _embed_query(q: str) -> list[float] | None:
    try:
        provider = get_provider()
        return provider.embed([q])[0]
    except Exception as exc:  # pragma: no cover - degrade gracefully
        logger.warning("Query embedding failed: %s", exc)
        return None


def _search_events(q: str, vec: list[float] | None, limit: int) -> Iterable[dict]:
    sq = SearchQuery(q, config="english")
    qs = (
        Event.objects.select_related("organisation", "location")
        .annotate(
            fts=Coalesce(SearchRank(F("search_vector"), sq), Value(0.0), output_field=FloatField()),
            trgm=Greatest(
                RawSQL("similarity(events_event.title, %s)", (q,), output_field=FloatField()),
                Value(0.0),
            ),
        )
    )
    if vec is not None:
        qs = qs.annotate(
            cos=Coalesce(
                RawSQL(
                    "1 - (events_event.embedding <=> %s::vector)",
                    (str(vec),),
                    output_field=FloatField(),
                ),
                Value(0.0),
            ),
        ).annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM + F("cos") * W_VEC)
    else:
        qs = qs.annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM)

    qs = qs.filter(score__gt=0).order_by("-score")[:limit]
    for e in qs:
        yield {
            "type": "event",
            "id": e.id,
            "title": e.title,
            "snippet": (e.description or "")[:200],
            "score": float(e.score or 0),
            "start_datetime": e.start_datetime.isoformat() if e.start_datetime else None,
            "organisation": {"id": e.organisation_id, "name": e.organisation.name},
            "location": (
                {"id": e.location_id, "name": e.location.name} if e.location_id else None
            ),
            "url": f"/app/events?focus={e.id}",
        }


def _search_organisations(q: str, vec: list[float] | None, limit: int) -> Iterable[dict]:
    sq = SearchQuery(q, config="english")
    qs = Organisation.objects.annotate(
        fts=Coalesce(SearchRank(F("search_vector"), sq), Value(0.0), output_field=FloatField()),
        trgm=Greatest(
            RawSQL(
                "similarity(organisations_organisation.name, %s)",
                (q,),
                output_field=FloatField(),
            ),
            Value(0.0),
        ),
    )
    if vec is not None:
        qs = qs.annotate(
            cos=Coalesce(
                RawSQL(
                    "1 - (organisations_organisation.embedding <=> %s::vector)",
                    (str(vec),),
                    output_field=FloatField(),
                ),
                Value(0.0),
            ),
        ).annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM + F("cos") * W_VEC)
    else:
        qs = qs.annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM)

    qs = qs.filter(score__gt=0).order_by("-score")[:limit]
    for o in qs:
        yield {
            "type": "organisation",
            "id": o.id,
            "title": o.name,
            "snippet": (o.description or "")[:200],
            "score": float(o.score or 0),
            "url": f"/app/organisations?focus={o.id}",
        }


@api_view(["GET"])
@permission_classes([AllowAny])
def search(request):
    """``GET /api/search/?q=...&types=event,organisation&limit=20``."""
    q = (request.query_params.get("q") or "").strip()
    if not q or len(q) < 2:
        return Response({"query": q, "results": []})

    try:
        limit = max(1, min(int(request.query_params.get("limit", 20)), 50))
    except ValueError:
        limit = 20

    types = {
        t.strip()
        for t in (request.query_params.get("types") or "event,organisation").split(",")
        if t.strip()
    }

    vec = _embed_query(q)

    results: list[dict] = []
    if "event" in types:
        results.extend(_search_events(q, vec, limit))
    if "organisation" in types:
        results.extend(_search_organisations(q, vec, limit))

    results.sort(key=lambda r: r["score"], reverse=True)
    return Response(
        {
            "query": q,
            "vector": vec is not None,
            "results": results[:limit],
        }
    )
