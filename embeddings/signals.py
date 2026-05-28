"""Post-save handlers that enqueue Celery embed tasks.

We use ``transaction.on_commit`` so the worker only sees rows that have
actually been committed.
"""

from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from events.models import Event
from organisations.models import Organisation


@receiver(post_save, sender=Event)
def event_saved(sender, instance: Event, **kwargs):
    pk = instance.pk

    def _enqueue():
        from .tasks import embed_event

        embed_event.delay(pk)

    transaction.on_commit(_enqueue)


@receiver(post_save, sender=Organisation)
def organisation_saved(sender, instance: Organisation, **kwargs):
    pk = instance.pk

    def _enqueue():
        from .tasks import embed_organisation

        embed_organisation.delay(pk)

    transaction.on_commit(_enqueue)
