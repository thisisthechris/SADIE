"""
Enable the PostGIS extension on the configured database, if not already enabled.

Managed Postgres providers (e.g. Render) hand out a fresh database with no
extensions enabled. Django's own `migrate` needs PostGIS already installed
before it can create any geometry-backed columns (django.contrib.gis models),
so this command must run BEFORE `migrate` on every deploy — see the
`preDeployCommand` in render.yaml.

Safe to run repeatedly: `CREATE EXTENSION IF NOT EXISTS` is a no-op if the
extension is already enabled (e.g. local dev's postgis Docker image, which
already ships with it preinstalled).

On a brand-new Render Blueprint deploy, the Postgres instance may still be
provisioning when the web service's very first preDeployCommand runs (Render
doesn't guarantee resource start-up ordering the way docker-compose's
`depends_on` does), so this command retries the initial connection for a
while before giving up.
"""

import time

from django.core.management.base import BaseCommand
from django.db import OperationalError, connection


class Command(BaseCommand):
    help = "Enable the PostGIS extension on the configured database (idempotent)."

    def handle(self, *args, **options):
        self._wait_for_database()
        with connection.cursor() as cursor:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
        self.stdout.write(self.style.SUCCESS("PostGIS extension is enabled."))

    def _wait_for_database(self, attempts: int = 30, delay: float = 2) -> None:
        for attempt in range(1, attempts + 1):
            try:
                connection.ensure_connection()
                return
            except OperationalError:
                if attempt == attempts:
                    raise
                self.stdout.write(f"Database not ready yet (attempt {attempt}/{attempts}), retrying in {delay}s...")
                connection.close()
                time.sleep(delay)
