from django.core.management import call_command
from django.core.management.base import BaseCommand

from scraping.models import ScrapeSource


class Command(BaseCommand):
    help = "Set up default scrape sources from fixture"

    def handle(self, *args, **options):
        count = ScrapeSource.objects.count()

        if count > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"Found {count} existing source(s). Skipping setup.\n"
                    "Use --force to reload anyway (will update existing sources)."
                )
            )
            return

        self.stdout.write("Loading scrape sources from fixture...")
        try:
            call_command("loaddata", "sources.json", verbosity=0)
            new_count = ScrapeSource.objects.count()
            self.stdout.write(
                self.style.SUCCESS(f"✓ Loaded {new_count} scrape source(s)")
            )

            # Show what was loaded
            for source in ScrapeSource.objects.all().order_by("name"):
                status = "enabled" if source.enabled else "disabled"
                self.stdout.write(f"  • {source.name} ({status})")

        except Exception as exc:
            self.stdout.write(
                self.style.ERROR(
                    f"✗ Failed to load sources: {exc}\n"
                    "Make sure scraping/fixtures/sources.json exists."
                )
            )
            raise
