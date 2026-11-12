"""Rebuild the pre-computed Common Pathways tables (analytics.journey_flows).

Runs nightly via Celery beat and after ``import_partner_csv``. Run it by hand
after loading data any other way, e.g. ``simulate_test_data``.

Usage:
    python manage.py rebuild_journey_flows
"""

from django.core.management.base import BaseCommand

from analytics.caching import invalidate_stats_cache
from analytics.journey_flows import rebuild_journey_flows


class Command(BaseCommand):
    help = "Rebuild the pre-computed venue-to-venue journey tables used by the Common Pathways map."

    def handle(self, *args, **options):
        build = rebuild_journey_flows()
        invalidate_stats_cache()
        self.stdout.write(
            self.style.SUCCESS(
                f"Rebuilt journey flows: {build.flow_rows} flow rows from "
                f"{build.interaction_count} interactions in {build.duration_ms} ms."
            )
        )
