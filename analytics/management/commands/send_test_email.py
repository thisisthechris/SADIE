"""Send a single test email to verify EMAIL_BACKEND/Mailgun config in a
given environment (e.g. run separately on Render's sadie-web and
sadie-celery shells — each service has its own env vars, so a working send
from one does not imply the other is configured correctly).

Unlike the account-creation/digest/anomaly-alert email sends elsewhere in
the codebase, this command does NOT swallow send failures — exceptions
propagate so they're visible in the shell.

Usage:
    python manage.py send_test_email someone@example.com
"""

from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Send a test email to verify EMAIL_BACKEND/Mailgun configuration in this environment."

    def add_arguments(self, parser):
        parser.add_argument("recipient", type=str, help="Email address to send the test message to.")

    def handle(self, *args, **options):
        recipient = options["recipient"]
        if "@" not in recipient:
            raise CommandError(f"'{recipient}' doesn't look like a valid email address.")

        self.stdout.write(f"EMAIL_BACKEND = {settings.EMAIL_BACKEND}")
        self.stdout.write(f"DEFAULT_FROM_EMAIL = {settings.DEFAULT_FROM_EMAIL}")
        if settings.EMAIL_BACKEND == "django.core.mail.backends.console.EmailBackend":
            self.stdout.write(
                self.style.WARNING(
                    "Console backend is active (MAILGUN_API_KEY is unset in this environment) — "
                    "the message below will be printed here, not actually delivered."
                )
            )

        send_mail(
            subject="SADIE test email",
            message=f"This is a test email sent via 'manage.py send_test_email' to verify {recipient} can receive mail.",
            from_email=None,  # uses settings.DEFAULT_FROM_EMAIL
            recipient_list=[recipient],
            fail_silently=False,
        )
        self.stdout.write(self.style.SUCCESS(f"Sent test email to {recipient}."))
