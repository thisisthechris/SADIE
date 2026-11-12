from io import StringIO
from unittest import mock

from django.core.management import CommandError, call_command
from django.test import TestCase

from .models import DataUpgrade

NAME = "2026-11-two-step-hashing-reimport"


@mock.patch("imports.management.commands.apply_data_upgrades.call_command")
class ApplyDataUpgradesTest(TestCase):
    def run_cmd(self, *args):
        out = StringIO()
        call_command("apply_data_upgrades", *args, stdout=out)
        return out.getvalue()

    def test_runs_each_upgrade_once(self, inner):
        self.run_cmd()
        inner.assert_called_once_with("render_seed")
        self.assertTrue(DataUpgrade.objects.filter(name=NAME).exists())
        self.assertIn("No pending", self.run_cmd())
        inner.assert_called_once()

    def test_failed_step_is_not_recorded(self, inner):
        inner.side_effect = RuntimeError("broker down")
        with self.assertRaises(RuntimeError):
            self.run_cmd()
        self.assertFalse(DataUpgrade.objects.exists())

    def test_fake_and_list(self, inner):
        self.assertIn(f"[ ] {NAME}", self.run_cmd("--list"))
        self.run_cmd("--fake", NAME)
        self.assertIn(f"[x] {NAME}", self.run_cmd("--list"))
        self.run_cmd()
        inner.assert_not_called()
        with self.assertRaises(CommandError):
            self.run_cmd("--fake", "nope")
