"""
Create, reset, or delete a Django user account non-interactively.

Intended for use via a Render one-off job (`render jobs create <service-id>
--start-command "python manage.py create_or_reset_admin ..."`) when
Dashboard/CLI access to set environment variables or a shell isn't
convenient, e.g. for emergency admin access or ad hoc test-account setup.

Deliberately takes plain, space-separated flag=value arguments (no shell
operators, no quoting needed) since Render's job/command fields have proven
unreliable at interpreting shell metacharacters -- see scripts/render_predeploy.sh
for the same lesson learned the hard way.

Usage:
    python manage.py create_or_reset_admin --username foo --email foo@example.com --password secret --superuser
    python manage.py create_or_reset_admin --username foo --delete
"""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create/reset (or delete) a user account non-interactively, without needing shell access."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)
        parser.add_argument("--email", default="")
        parser.add_argument("--password", default=None)
        parser.add_argument("--staff", action="store_true")
        parser.add_argument("--superuser", action="store_true")
        parser.add_argument(
            "--delete", action="store_true", help="Delete the matching user instead of creating/updating it."
        )

    def handle(self, *args, **options):
        User = get_user_model()
        username = options["username"]

        if options["delete"]:
            deleted, _ = User.objects.filter(username=username).delete()
            if deleted:
                self.stdout.write(self.style.SUCCESS(f"Deleted user '{username}'."))
            else:
                self.stdout.write(f"No user named '{username}' found; nothing to delete.")
            return

        if not options["password"]:
            raise CommandError("--password is required unless --delete is set.")

        user, created = User.objects.get_or_create(username=username, defaults={"email": options["email"]})
        user.email = options["email"] or user.email
        user.set_password(options["password"])
        user.is_staff = options["staff"] or options["superuser"]
        user.is_superuser = options["superuser"]
        user.save()

        action = "Created" if created else "Updated"
        self.stdout.write(
            self.style.SUCCESS(f"{action} user '{username}' (staff={user.is_staff}, superuser={user.is_superuser}).")
        )
