from django.core.management.base import BaseCommand

from organisations.tasks import generate_daily_synthetic_analytics


class Command(BaseCommand):
    help = "Generate synthetic analytics data (for dev/testing only)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--sync",
            action="store_true",
            help="Run synchronously (blocking). Default is async via Celery workers.",
        )

    def handle(self, *args, **options):
        sync_mode = options.get("sync", False)

        self.stdout.write(
            self.style.WARNING(
                "⚠️  This command is for development/testing only.\n"
                "   Do NOT run in production environments."
            )
        )

        if sync_mode:
            self.stdout.write("Generating synthetic analytics data...")
            try:
                result = generate_daily_synthetic_analytics()
                self.stdout.write(
                    self.style.SUCCESS(f"✓ Synthetic data generation complete: {result}")
                )
            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"✗ Synthetic data generation failed: {exc}")
                )
                raise
        else:
            result = generate_daily_synthetic_analytics.delay()
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Dispatched async synthetic data generation.\n"
                    f"Task ID: {result.id}\n"
                    "Monitor with: docker compose logs -f celery"
                )
            )
