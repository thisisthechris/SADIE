from django.core.management.base import BaseCommand

from scraping.tasks import scrape_all_sources


class Command(BaseCommand):
    help = "Scrape all enabled event sources"

    def add_arguments(self, parser):
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (blocking). Default is async via Celery workers.",
        )

    def handle(self, *args, **options):
        sync_mode = options.get("sync", False)

        if sync_mode:
            self.stdout.write("Starting synchronous scrape of all sources...")
            try:
                dispatched = scrape_all_sources()
                self.stdout.write(self.style.SUCCESS(f"✓ Dispatched {dispatched} scrape task(s)."))
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"✗ Scrape dispatch failed: {exc}"))
                raise
        else:
            result = scrape_all_sources.delay()
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Dispatched async scrape for all sources.\n"
                    f"Task ID: {result.id}\n"
                    "Monitor with: docker compose logs -f celery"
                )
            )
