from django.core.management.base import BaseCommand, CommandError

from scraping.models import ScrapeSource
from scraping.tasks import (
    scrape_all_sources,
    scrape_box_plymouth,
    scrape_plymouth_culture,
    scrape_real_ideas,
    scrape_theatre_royal,
)


class Command(BaseCommand):
    help = "Trigger scraping tasks for event sources"

    def add_arguments(self, parser):
        parser.add_argument(
            "--source",
            type=str,
            default=None,
            help="Scrape a specific source by name (e.g., 'Plymouth Culture'). "
            "If not specified, all enabled sources are scraped.",
        )
        parser.add_argument(
            "--async",
            action="store_true",
            dest="async_mode",
            help="Dispatch tasks asynchronously (default). Celery workers must be running.",
        )
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run scrapes synchronously (blocking). Useful for testing/debugging.",
        )

    def handle(self, *args, **options):
        source_name = options.get("source")
        async_mode = not options.get("sync", False)

        if source_name:
            self._scrape_single_source(source_name, async_mode)
        else:
            self._scrape_all_sources(async_mode)

    def _scrape_single_source(self, source_name, async_mode):
        """Scrape a specific source by name."""
        try:
            source = ScrapeSource.objects.get(name=source_name)
        except ScrapeSource.DoesNotExist:
            raise CommandError(
                f"Source '{source_name}' not found. Available sources:\n"
                + "\n".join(
                    f"  • {s.name} ({s.scraper_task_name})" for s in ScrapeSource.objects.all().order_by("name")
                )
            )

        if not source.enabled:
            raise CommandError(f"Source '{source_name}' is disabled.")

        # Map task names to actual task functions
        task_map = {
            "scraping.tasks.scrape_plymouth_culture": scrape_plymouth_culture,
            "scraping.tasks.scrape_theatre_royal": scrape_theatre_royal,
            "scraping.tasks.scrape_box_plymouth": scrape_box_plymouth,
            "scraping.tasks.scrape_real_ideas": scrape_real_ideas,
        }

        task_func = task_map.get(source.scraper_task_name)
        if not task_func:
            raise CommandError(f"Unknown task: {source.scraper_task_name}")

        if async_mode:
            task_func.delay(source.pk)
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Dispatched async scrape for '{source.name}'. Monitor with 'docker compose logs celery'."
                )
            )
        else:
            self.stdout.write(f"Starting synchronous scrape of '{source.name}'...")
            try:
                task_func(source.pk)
                self.stdout.write(self.style.SUCCESS(f"✓ Scrape complete for '{source.name}'."))
            except Exception as exc:
                raise CommandError(f"Scrape failed: {exc}")

    def _scrape_all_sources(self, async_mode):
        """Scrape all enabled sources."""
        enabled_sources = ScrapeSource.objects.filter(enabled=True)
        count = enabled_sources.count()

        if count == 0:
            raise CommandError("No enabled sources to scrape.")

        self.stdout.write(f"Found {count} enabled source(s):")
        for source in enabled_sources.order_by("name"):
            self.stdout.write(f"  • {source.name}")

        if async_mode:
            result = scrape_all_sources.delay()
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Dispatched async scrape for all {count} source(s). "
                    f"Task ID: {result.id}\n"
                    "Monitor with 'docker compose logs celery'."
                )
            )
        else:
            self.stdout.write("Starting synchronous scrape of all sources...")
            try:
                dispatched = scrape_all_sources()
                self.stdout.write(self.style.SUCCESS(f"✓ Dispatched {dispatched} scrape task(s)."))
            except Exception as exc:
                raise CommandError(f"Scrape dispatch failed: {exc}")
