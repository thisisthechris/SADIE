"""Celery tasks that compute and persist search vectors + embeddings."""

from __future__ import annotations

import logging

from celery import shared_task
from django.contrib.postgres.search import SearchVector
from django.db import transaction

from .services import event_text, get_provider, organisation_text


logger = logging.getLogger(__name__)


def _refresh_event_search_vector(event_id: int) -> None:
    from events.models import Event

    Event.objects.filter(pk=event_id).update(
        search_vector=(
            SearchVector("title", weight="A", config="english")
            + SearchVector("description", weight="B", config="english")
        )
    )


def _refresh_organisation_search_vector(org_id: int) -> None:
    from organisations.models import Organisation

    Organisation.objects.filter(pk=org_id).update(
        search_vector=(
            SearchVector("name", weight="A", config="english")
            + SearchVector("description", weight="B", config="english")
        )
    )


@shared_task(name="embeddings.embed_event", ignore_result=True)
def embed_event(event_id: int) -> None:
    from events.models import Event

    try:
        event = Event.objects.select_related("organisation", "location").get(pk=event_id)
    except Event.DoesNotExist:
        return

    _refresh_event_search_vector(event_id)

    text = event_text(event)
    if not text:
        return
    provider = get_provider()
    vec = provider.embed([text])[0]
    Event.objects.filter(pk=event_id).update(embedding=vec)


@shared_task(name="embeddings.embed_organisation", ignore_result=True)
def embed_organisation(org_id: int) -> None:
    from organisations.models import Organisation

    try:
        org = Organisation.objects.get(pk=org_id)
    except Organisation.DoesNotExist:
        return

    _refresh_organisation_search_vector(org_id)

    text = organisation_text(org)
    if not text:
        return
    provider = get_provider()
    vec = provider.embed([text])[0]
    Organisation.objects.filter(pk=org_id).update(embedding=vec)


@shared_task(name="embeddings.backfill", ignore_result=True)
def backfill(batch_size: int = 64) -> dict:
    """Recompute embeddings + search vectors for all rows. Safe to re-run."""
    from events.models import Event
    from organisations.models import Organisation

    provider = get_provider()
    counts = {"events": 0, "organisations": 0}

    for org in Organisation.objects.iterator(chunk_size=batch_size):
        text = organisation_text(org)
        vec = provider.embed([text])[0] if text else None
        with transaction.atomic():
            _refresh_organisation_search_vector(org.pk)
            if vec is not None:
                Organisation.objects.filter(pk=org.pk).update(embedding=vec)
        counts["organisations"] += 1

    qs = Event.objects.select_related("organisation", "location").iterator(chunk_size=batch_size)
    for event in qs:
        text = event_text(event)
        vec = provider.embed([text])[0] if text else None
        with transaction.atomic():
            _refresh_event_search_vector(event.pk)
            if vec is not None:
                Event.objects.filter(pk=event.pk).update(embedding=vec)
        counts["events"] += 1

    logger.info("Embeddings backfill complete: %s", counts)
    return counts
