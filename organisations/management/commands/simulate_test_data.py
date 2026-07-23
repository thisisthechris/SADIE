"""
One-shot data simulation for test/staging deployments.

Orchestrates the existing seed commands into a single, deploy-safe entry
point so a test/staging stack can regenerate a realistic demo dataset every
time it redeploys:

  1. setup_plymouth_culture --venues-only   (idempotent venues/categories)
  2. setup_demo_user --no-synthetic-data    (idempotent demo user + org tree)
  3. generate_synthetic_data                (adds a small batch of new
                                              events/interactions/postcodes —
                                              cumulative, no --clear, so
                                              repeated deploys grow the
                                              dataset gradually rather than
                                              resetting it)
  4. geocode_postcodes                      (best-effort; calls postcodes.io)
  5. backfill_search                        (recompute search vectors/embeddings)

NOTE: For development/testing (or a dedicated test/staging stack) only.
Do NOT enable this against a real production database — see the
SEED_DEMO_DATA flag in docker-compose.prod.yml / .env.example.

Every step is wrapped so a single failure (e.g. no network access for
postcodes.io) is logged and skipped rather than aborting the whole command —
this is meant to run unattended as part of container startup and must never
prevent gunicorn from starting.

Usage:
    python manage.py simulate_test_data
    python manage.py simulate_test_data --events 30 --interactions 150
    python manage.py simulate_test_data --skip-geocode --skip-embeddings
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Run the full test-deployment data simulation in one go (dev/test only)."

    def add_arguments(self, parser):
        # Deliberately small defaults — this is meant to run on EVERY deploy
        # and top up the dataset a little each time, not regenerate it from
        # scratch. Compare to setup_demo_user's one-time 200/1000/3000.
        parser.add_argument("--events", type=int, default=15, help="New events to add this run (default: 15)")
        parser.add_argument(
            "--interactions", type=int, default=75, help="New user-hash interactions to add (default: 75)"
        )
        parser.add_argument(
            "--postcodes", type=int, default=150, help="New postcode interaction records to add (default: 150)"
        )
        parser.add_argument(
            "--postcode-events",
            type=int,
            default=60,
            help="New postcode→event cohort records to add (default: 60)",
        )
        parser.add_argument(
            "--postcode-tickets",
            type=int,
            default=90,
            help="New postcode ticket-purchase records to add (default: 90)",
        )
        parser.add_argument(
            "--skip-geocode",
            action="store_true",
            help="Skip the postcodes.io geocoding step (useful when there's no outbound network access)",
        )
        parser.add_argument(
            "--skip-embeddings",
            action="store_true",
            help="Skip the search-vector/embedding backfill step",
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("=== SADIE test-data simulation (dev/test only) ==="))

        self._step("Ensuring Plymouth venues + categories exist", "setup_plymouth_culture", venues_only=True)

        self._step(
            "Ensuring demo user + org hierarchy exist", "setup_demo_user", no_synthetic_data=True, verbosity=1
        )

        self._step(
            "Adding a fresh batch of synthetic events/interactions/postcodes",
            "generate_synthetic_data",
            events=options["events"],
            interactions=options["interactions"],
            postcodes=options["postcodes"],
            postcode_events=options["postcode_events"],
            postcode_tickets=options["postcode_tickets"],
        )

        if options["skip_geocode"]:
            self.stdout.write("Skipping postcode geocoding (--skip-geocode).")
        else:
            self._step("Geocoding any new postcodes via postcodes.io", "geocode_postcodes")

        if options["skip_embeddings"]:
            self.stdout.write("Skipping search/embedding backfill (--skip-embeddings).")
        else:
            self._step("Backfilling search vectors + embeddings", "backfill_search")

        self._print_summary()

    def _step(self, description, command_name, **kwargs):
        """Run a management command, logging but never raising on failure."""
        self.stdout.write(f"\n--- {description} ({command_name}) ---")
        try:
            call_command(command_name, **kwargs)
        except Exception as exc:  # noqa: BLE001 — must never abort deploy startup
            self.stderr.write(self.style.ERROR(f"  ✗ {command_name} failed, continuing: {exc!r}"))

    def _print_summary(self):
        from analytics.models import PostcodeAreaInteraction, UserHashInteraction
        from events.models import Event
        from organisations.models import Organisation

        self.stdout.write("\n" + self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS("Simulation complete. Current totals:"))
        self.stdout.write(f"  Organisations:          {Organisation.objects.count()}")
        self.stdout.write(f"  Events:                 {Event.objects.count()}")
        self.stdout.write(f"  UserHashInteractions:   {UserHashInteraction.objects.count()}")
        self.stdout.write(f"  PostcodeAreaInteraction:{PostcodeAreaInteraction.objects.count()}")
