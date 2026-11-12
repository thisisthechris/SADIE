"""Run one-off data steps once per environment, on deploy.

Render's ``initialDeployHook`` only runs on a service's very first deploy, so
data changes that ship with code (like re-importing after a hashing change)
go here instead. ``scripts/render_predeploy.sh`` calls this after ``migrate``
on every deploy; each step runs once and is then recorded in ``DataUpgrade``.

To add a step: append ``(name, function)`` to ``UPGRADES``. Names must never
change once deployed. Steps should be safe to re-run if a deploy fails midway,
because a step is only recorded after it succeeds.

    python manage.py apply_data_upgrades            # run pending steps
    python manage.py apply_data_upgrades --list     # show what's applied/pending
    python manage.py apply_data_upgrades --fake NAME  # mark a step done without running it
"""

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError

from imports.models import DataUpgrade


def reimport_with_two_step_hashing():
    """Stored visitor hashes changed to server_hash(client_hash(email)) and
    postcodes to sectors, so rebuild the partner dataset from csv_exports.
    render_seed waits for the broker, re-imports with --clear (which also
    rebuilds the journey-flow tables), enriches events and geocodes venues."""
    call_command("render_seed")


UPGRADES = [
    ("2026-11-two-step-hashing-reimport", reimport_with_two_step_hashing),
]


class Command(BaseCommand):
    help = "Apply pending one-off data upgrades (run on every deploy; each step runs once)."

    def add_arguments(self, parser):
        parser.add_argument("--list", action="store_true", help="Show applied and pending upgrades.")
        parser.add_argument("--fake", metavar="NAME", help="Record NAME as applied without running it.")

    def handle(self, *args, list=False, fake=None, **options):
        done = set(DataUpgrade.objects.values_list("name", flat=True))
        names = [name for name, _ in UPGRADES]

        if list:
            for name in names:
                self.stdout.write(f"[{'x' if name in done else ' '}] {name}")
            return
        if fake:
            if fake not in names:
                raise CommandError(f"Unknown upgrade {fake!r}. Known: {', '.join(names)}")
            DataUpgrade.objects.get_or_create(name=fake)
            self.stdout.write(self.style.SUCCESS(f"Marked {fake} as applied."))
            return

        pending = [(name, fn) for name, fn in UPGRADES if name not in done]
        if not pending:
            self.stdout.write("No pending data upgrades.")
            return
        for name, fn in pending:
            self.stdout.write(f"Applying data upgrade {name}...")
            fn()
            DataUpgrade.objects.create(name=name)
            self.stdout.write(self.style.SUCCESS(f"Applied {name}."))
