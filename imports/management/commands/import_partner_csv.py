"""
Import partner test-data CSV exports into a fresh SADIE demo environment.

Reads every recognised CSV under --path (default: csv_exports/ at the repo
root), normalizes each row via imports.parsers, and persists Organisations/
Locations/Events plus the four analytics tables via imports.services.

SECURITY: Name/Email columns are hashed (salted SHA-256) the moment they're
read and never written to the database or printed. Only aggregate counts are
reported.

Usage:
    python manage.py import_partner_csv
    python manage.py import_partner_csv --dry-run
    python manage.py import_partner_csv --clear
    python manage.py import_partner_csv --path /some/other/csv_exports
"""

import csv
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from imports.parsers import UnknownOrganisationCode, get_parser_for_header, resolve_org_code
from imports.services import ImportContext, clear_partner_data

SKIP_FILES = {"_conversion_manifest.csv"}


class Command(BaseCommand):
    help = "Import partner test-data CSV exports (csv_exports/) into the demo environment."

    def add_arguments(self, parser):
        parser.add_argument(
            "--path",
            type=str,
            default=None,
            help="Directory to scan for CSV files (default: csv_exports/ at the repo root).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and validate only — no database writes. Prints per-file row counts.",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all data for the known partner organisations before importing.",
        )

    def handle(self, *args, **options):
        base_path = Path(options["path"]) if options["path"] else settings.BASE_DIR / "csv_exports"
        if not base_path.is_dir():
            raise CommandError(f"Not a directory: {base_path}")

        dry_run = options["dry_run"]
        clear = options["clear"]

        csv_files = sorted(p for p in base_path.rglob("*.csv") if p.name not in SKIP_FILES)
        if not csv_files:
            raise CommandError(f"No CSV files found under {base_path}")

        if clear and not dry_run:
            self.stdout.write(self.style.WARNING("Clearing existing partner data..."))
            clear_partner_data()

        ctx = ImportContext()
        file_summaries = []
        total_rows = 0
        total_skipped = 0

        for csv_path in csv_files:
            rows_ok, rows_skipped = self._process_file(csv_path, ctx, dry_run=dry_run)
            total_rows += rows_ok
            total_skipped += rows_skipped
            file_summaries.append((csv_path.relative_to(base_path), rows_ok, rows_skipped))

        for rel_path, rows_ok, rows_skipped in file_summaries:
            suffix = f" ({rows_skipped} skipped)" if rows_skipped else ""
            self.stdout.write(f"  {rel_path}: {rows_ok} rows{suffix}")

        if dry_run:
            self.stdout.write(
                self.style.SUCCESS(f"\n[DRY RUN] {total_rows} rows parsed OK, {total_skipped} skipped. No DB writes.")
            )
            return

        with transaction.atomic():
            summary = ctx.flush()

        self.stdout.write(self.style.SUCCESS("\n=== Import complete ==="))
        self.stdout.write(f"Rows parsed: {total_rows} ({total_skipped} skipped)")
        self.stdout.write(f"Organisations touched: {sorted(ctx.orgs_touched)}")
        for key, value in summary.items():
            self.stdout.write(f"  {key}: {value}")

    def _process_file(self, csv_path: Path, ctx: ImportContext, dry_run: bool) -> tuple[int, int]:
        try:
            org_code = resolve_org_code(csv_path)
        except UnknownOrganisationCode as exc:
            self.stderr.write(self.style.WARNING(f"Skipping {csv_path.name}: {exc}"))
            return 0, 0

        with open(csv_path, newline="", encoding="utf-8-sig") as fh:
            reader = csv.DictReader(fh)
            header = reader.fieldnames or []
            match = get_parser_for_header(header)
            if match is None:
                self.stderr.write(self.style.WARNING(f"Skipping {csv_path.name}: unrecognised column headers"))
                return 0, 0
            parser_fn, _label = match

            rows_ok = 0
            rows_skipped = 0
            for row in reader:
                booking = parser_fn(row, org_code)
                if booking is None:
                    rows_skipped += 1
                    continue
                rows_ok += 1
                if not dry_run:
                    ctx.record_booking(booking)

        return rows_ok, rows_skipped
