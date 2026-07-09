"""
Management command to set up a Plymouth Culture demo user and org hierarchy.

Creates (or updates) a top-level "Plymouth Culture" parent organisation,
assigns all known Plymouth venue orgs as its children, and creates a demo
user who is a member of Plymouth Culture and every child org so that:

  • OrgToggle shows "Plymouth Culture" for the demo user.
  • Venue pins on the Postcodes Pathways Map are highlighted (pink) when
    the org filter is active, because the demo user's memberships span
    all child orgs.

Usage:
    python manage.py setup_demo_user
    python manage.py setup_demo_user --email demo@example.com --password secret
    python manage.py setup_demo_user --no-synthetic-data
"""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import BaseCommand

from organisations.models import Organisation

# ---------------------------------------------------------------------------
# Plymouth Culture child org names (must match what setup_plymouth_culture
# and generate_synthetic_data create).
# ---------------------------------------------------------------------------
CHILD_ORG_NAMES = [
    "Theatre Royal Plymouth",
    "The Box Plymouth",
    "Plymouth Pavilions",
    "Barbican Theatre",
    "Plymouth Arts Cinema",
    "Ocean Studios",
    "Plymouth Music Zone",
    "Devonport Guildhall",
    "Real Ideas",
    "Plymouth City Council",
]

PARENT_ORG_NAME = "Plymouth Culture"
DEFAULT_EMAIL = "demo@plymouthculture.co.uk"
DEFAULT_PASSWORD = "demo1234"


class Command(BaseCommand):
    help = "Create Plymouth Culture demo user, org hierarchy, and synthetic data"

    def add_arguments(self, parser):
        parser.add_argument(
            "--email",
            default=DEFAULT_EMAIL,
            help=f"Demo user email (default: {DEFAULT_EMAIL})",
        )
        parser.add_argument(
            "--password",
            default=DEFAULT_PASSWORD,
            help=f"Demo user password (default: {DEFAULT_PASSWORD})",
        )
        parser.add_argument(
            "--no-synthetic-data",
            action="store_true",
            help="Skip running generate_synthetic_data after setup",
        )

    def handle(self, *args, **options):
        email = options["email"]
        password = options["password"]

        # ------------------------------------------------------------------
        # 1. Ensure Plymouth Culture venues exist (idempotent).
        # ------------------------------------------------------------------
        self.stdout.write("Running setup_plymouth_culture --venues-only …")
        call_command("setup_plymouth_culture", venues_only=True, verbosity=0)

        # ------------------------------------------------------------------
        # 2. Create / update the Plymouth Culture parent org.
        # ------------------------------------------------------------------
        parent, created = Organisation.objects.get_or_create(
            name=PARENT_ORG_NAME,
            defaults={
                "website": "https://www.plymouthculture.co.uk",
                "description": (
                    "Plymouth Culture is the city's arts and culture development "
                    "organisation, supporting and promoting Plymouth's creative sector."
                ),
                "is_partner": True,
            },
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created parent org: {parent.name}"))
        else:
            self.stdout.write(f"Parent org already exists: {parent.name}")

        # Parent must itself be top-level (no parent of its own).
        if parent.parent_id is not None:
            parent.parent = None
            parent.save(update_fields=["parent"])

        # ------------------------------------------------------------------
        # 3. Assign child orgs to Plymouth Culture.
        # ------------------------------------------------------------------
        assigned = 0
        for name in CHILD_ORG_NAMES:
            try:
                child = Organisation.objects.get(name=name)
                if child.parent_id != parent.pk:
                    child.parent = parent
                    child.save(update_fields=["parent"])
                    self.stdout.write(f"  Assigned child: {name}")
                    assigned += 1
                else:
                    self.stdout.write(f"  Already child: {name}")
            except Organisation.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"  Child org not found, skipping: {name}")
                )

        if assigned:
            self.stdout.write(self.style.SUCCESS(f"Assigned {assigned} child orgs to {PARENT_ORG_NAME}"))

        # ------------------------------------------------------------------
        # 4. Create or update the demo user.
        # ------------------------------------------------------------------
        User = get_user_model()
        user, user_created = User.objects.get_or_create(
            email=email,
            defaults={"username": email, "is_staff": False},
        )
        user.set_password(password)
        user.save(update_fields=["password"])

        if user_created:
            self.stdout.write(self.style.SUCCESS(f"Created demo user: {email}"))
        else:
            self.stdout.write(f"Updated password for existing user: {email}")

        # ------------------------------------------------------------------
        # 5. Add demo user as member of Plymouth Culture and all child orgs.
        #    This ensures OrgToggle shows Plymouth Culture, and that venue
        #    pin coloring (myOrgIds) covers all child org venues too.
        # ------------------------------------------------------------------
        all_orgs = [parent] + list(parent.children.all())
        for org in all_orgs:
            org.members.add(user)
        self.stdout.write(
            self.style.SUCCESS(
                f"Added {email} as member of {len(all_orgs)} orgs "
                f"({parent.name} + {len(all_orgs) - 1} children)"
            )
        )

        # ------------------------------------------------------------------
        # 6. Optionally generate synthetic interaction data.
        # ------------------------------------------------------------------
        if not options["no_synthetic_data"]:
            self.stdout.write("Generating synthetic data (events=200, interactions=1000, postcodes=3000) …")
            call_command(
                "generate_synthetic_data",
                events=200,
                interactions=1000,
                postcodes=3000,
                verbosity=1,
            )
        else:
            self.stdout.write("Skipped synthetic data generation (--no-synthetic-data).")

        # ------------------------------------------------------------------
        # Summary
        # ------------------------------------------------------------------
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=== Demo setup complete ==="))
        self.stdout.write(f"  Login:    {email}")
        self.stdout.write(f"  Password: {password}")
        self.stdout.write(f"  Org:      {parent.name} (id={parent.pk})")
        self.stdout.write(
            "  OrgToggle will show 'Plymouth Culture' and filter to all "
            f"{len(all_orgs) - 1} venue orgs via the parent hierarchy."
        )
