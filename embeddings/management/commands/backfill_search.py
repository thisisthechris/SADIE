"""Backfill search vectors + embeddings for all events and organisations."""

from django.core.management.base import BaseCommand

from embeddings.tasks import backfill


class Command(BaseCommand):
    help = "Recompute search_vector and embedding for every Event and Organisation."

    def add_arguments(self, parser):
        parser.add_argument("--async", action="store_true", help="Run via Celery worker.")
        parser.add_argument("--batch-size", type=int, default=64)

    def handle(self, *args, **opts):
        if opts["async"]:
            res = backfill.delay(batch_size=opts["batch_size"])
            self.stdout.write(self.style.SUCCESS(f"Queued backfill task: {res.id}"))
            return
        counts = backfill(batch_size=opts["batch_size"])
        self.stdout.write(self.style.SUCCESS(f"Backfilled: {counts}"))
