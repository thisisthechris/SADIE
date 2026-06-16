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
from collections.abc import Iterable

from django.contrib.postgres.search import SearchQuery, SearchRank
from django.db.models import F, FloatField, Model, QuerySet, Value
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


def _annotate_similarity_score(qs: QuerySet, q: str, table_field: str, vec: list[float] | None) -> QuerySet:
    """Annotate query set with hybrid similarity score (FTS + trigram + vector).

    Args:
        qs: QuerySet to annotate
        q: Search query string
        table_field: Field name for trigram similarity (e.g., "events_event.title")
        vec: Optional embedding vector for cosine similarity

    Returns:
        QuerySet with 'score' annotation combining all three signals
    """
    sq = SearchQuery(q, config="english")
    qs = qs.annotate(
        fts=Coalesce(SearchRank(F("search_vector"), sq), Value(0.0), output_field=FloatField()),
        trgm=Greatest(
            RawSQL(f"similarity({table_field}, %s)", (q,), output_field=FloatField()),
            Value(0.0),
        ),
    )
    if vec is not None:
        # Extract embedding field name from table_field (e.g., "events_event.title" -> "embedding")
        table_name = table_field.split(".")[0]
        embedding_field = f"{table_name}.embedding"
        qs = qs.annotate(
            cos=Coalesce(
                RawSQL(
                    f"1 - ({embedding_field} <=> %s::vector)",
                    (str(vec),),
                    output_field=FloatField(),
                ),
                Value(0.0),
            ),
        ).annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM + F("cos") * W_VEC)
    else:
        qs = qs.annotate(score=F("fts") * W_FTS + F("trgm") * W_TRGM)

    return qs


def _search_model(
    q: str,
    vec: list[float] | None,
    limit: int,
    model: type[Model],
    result_type: str,
    select_related: list[str] | None = None,
    trigram_field: str | None = None,
    formatter: callable | None = None,
) -> Iterable[dict]:
    """Generic search helper for any searchable model.

    Args:
        q: Search query string
        vec: Optional embedding vector
        limit: Maximum results to return
        model: Django model class to search
        result_type: Type label for results (e.g., "event")
        select_related: List of related fields to select
        trigram_field: Field name for trigram similarity
        formatter: Callable to format result dict from model instance

    Yields:
        Formatted result dictionaries
    """
    qs = model.objects.all()

    if select_related:
        qs = qs.select_related(*select_related)

    if trigram_field is None:
        trigram_field = "name"

    table_name = model._meta.db_table
    table_field = f"{table_name}.{trigram_field}"

    qs = _annotate_similarity_score(qs, q, table_field, vec)
    qs = qs.filter(score__gt=0).order_by("-score")[:limit]

    for instance in qs:
        if formatter:
            yield formatter(instance, result_type)
        else:
            yield {"type": result_type, "id": instance.id, "score": float(instance.score or 0)}


def _format_event(event: Event, result_type: str) -> dict:
    """Format event model as search result."""
    return {
        "type": result_type,
        "id": event.id,
        "title": event.title,
        "snippet": (event.description or "")[:200],
        "score": float(event.score or 0),
        "start_datetime": event.start_datetime.isoformat() if event.start_datetime else None,
        "organisation": {"id": event.organisation_id, "name": event.organisation.name},
        "location": ({"id": event.location_id, "name": event.location.name} if event.location_id else None),
        "url": f"/app/events?focus={event.id}",
    }


def _format_organisation(org: Organisation, result_type: str) -> dict:
    """Format organisation model as search result."""
    return {
        "type": result_type,
        "id": org.id,
        "title": org.name,
        "snippet": (org.description or "")[:200],
        "score": float(org.score or 0),
        "url": f"/app/organisations?focus={org.id}",
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

    types = {t.strip() for t in (request.query_params.get("types") or "event,organisation").split(",") if t.strip()}

    vec = _embed_query(q)

    results: list[dict] = []
    if "event" in types:
        results.extend(
            _search_model(
                q,
                vec,
                limit,
                Event,
                "event",
                select_related=["organisation", "location"],
                trigram_field="title",
                formatter=_format_event,
            )
        )
    if "organisation" in types:
        results.extend(
            _search_model(
                q,
                vec,
                limit,
                Organisation,
                "organisation",
                trigram_field="name",
                formatter=_format_organisation,
            )
        )

    results.sort(key=lambda r: r["score"], reverse=True)
    return Response(
        {
            "query": q,
            "vector": vec is not None,
            "results": results[:limit],
        }
    )

