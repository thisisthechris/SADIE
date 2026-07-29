"""
One-time Render deploy seeding: waits for the Celery broker to become
reachable, then imports + geocodes the partner CSV test dataset.

Why the wait: `embeddings/signals.py`'s `post_save` receivers on
`Organisation`/`Event` enqueue Celery tasks via `transaction.on_commit`. This
only ever happens outside a test transaction (i.e. for any real import run
like this one) — if the broker isn't reachable yet, the enqueue call raises
`kombu.exceptions.OperationalError` and `import_partner_csv` crashes outright.

Render's Blueprint deploy doesn't guarantee that `sadie-redis` is fully up by
the time `sadie-web`'s `initialDeployHook` runs (there's no docker-compose-style
`depends_on` between Render services), so this command waits for the broker
before running the actual import.

Intended to run ONCE via sadie-web's `initialDeployHook` in render.yaml, right
after the first successful deploy. Safe to re-run manually later if needed:
`import_partner_csv --clear` resets the dataset from scratch and
`geocode_venues` is idempotent (add --force to re-geocode already-set venues).
"""

import os
import time

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Wait for the Celery broker, then seed + geocode the partner CSV test dataset (Render initialDeployHook)."

    def handle(self, *args, **options):
        self._wait_for_broker()
        self.stdout.write("Importing partner CSV test data...")
        call_command("import_partner_csv", clear=True)
        self.stdout.write("Geocoding venues...")
        call_command("geocode_venues")
        self.stdout.write(self.style.SUCCESS("Render seed complete."))

    def _wait_for_broker(self, attempts: int = 30, delay: float = 2) -> None:
        broker_url = os.environ.get("CELERY_BROKER_URL")
        if not broker_url:
            return  # nothing to wait for (e.g. local run without Celery configured)

        import redis

        for attempt in range(1, attempts + 1):
            try:
                redis.from_url(broker_url).ping()
                self.stdout.write(f"Celery broker reachable after {attempt} attempt(s).")
                return
            except redis.exceptions.RedisError:
                if attempt == attempts:
                    raise
                self.stdout.write(
                    f"Celery broker not ready yet (attempt {attempt}/{attempts}), retrying in {delay}s..."
                )
                time.sleep(delay)
