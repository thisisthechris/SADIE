"""Management command to geocode all postcodes in PostcodeAreaInteraction."""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from analytics.geocoding import geocode_postcode_bulk, normalize_postcode
from analytics.models import PostcodeAreaInteraction, PostcodeGeo


class Command(BaseCommand):
    help = "Geocode all unique postcodes in PostcodeAreaInteraction using postcodes.io."

    def add_arguments(self, parser):
        parser.add_argument(
            "--retry-failed",
            action="store_true",
            help="Retry previously failed postcodes (default: skip).",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=100,
            help="Number of postcodes per batch (max 100).",
        )

    def handle(self, *args, **options):
        retry_failed = options.get("retry_failed", False)
        batch_size = min(options.get("batch_size", 100), 100)

        # Get all unique postcodes from interactions
        distinct_postcodes = (
            PostcodeAreaInteraction.objects
            .values_list("postcode", flat=True)
            .distinct()
            .order_by("postcode")
        )
        total_count = len(distinct_postcodes)
        self.stdout.write(f"Found {total_count} unique postcodes to process.")

        # Filter by status if not retrying failed
        if not retry_failed:
            existing_successful = PostcodeGeo.objects.filter(status="success").values_list(
                "postcode", flat=True
            )
            existing_successful_set = set(existing_successful)
            to_geocode = [p for p in distinct_postcodes if p not in existing_successful_set]
            skipped = total_count - len(to_geocode)
            self.stdout.write(f"Skipping {skipped} already successfully geocoded. Processing {len(to_geocode)}.")
        else:
            to_geocode = list(distinct_postcodes)
            self.stdout.write("Retrying all postcodes (including previously failed).")

        if not to_geocode:
            self.stdout.write(self.style.success("All postcodes already geocoded!"))
            return

        # Process in batches
        total_processed = 0
        successful = 0
        failed = 0

        for i in range(0, len(to_geocode), batch_size):
            batch = to_geocode[i : i + batch_size]
            self.stdout.write(f"\nBatch {i // batch_size + 1}/{(len(to_geocode) + batch_size - 1) // batch_size}:")
            self.stdout.write(f"  Processing {len(batch)} postcodes...")

            results = geocode_postcode_bulk(batch, skip_cached=False)

            batch_successful = sum(1 for v in results.values() if v is not None)
            batch_failed = len(batch) - batch_successful

            successful += batch_successful
            failed += batch_failed
            total_processed += len(batch)

            self.stdout.write(f"  ✓ {batch_successful} successful, ✗ {batch_failed} failed")

        # Summary
        self.stdout.write("\n" + self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS(f"Geocoding complete!"))
        self.stdout.write(f"  Processed: {total_processed}")
        self.stdout.write(self.style.SUCCESS(f"  Successful: {successful}"))
        self.stdout.write(self.style.ERROR(f"  Failed: {failed}"))

        # Final stats
        total_geo = PostcodeGeo.objects.count()
        successful_geo = PostcodeGeo.objects.filter(status="success").count()
        failed_geo = PostcodeGeo.objects.filter(status="failed").count()
        pending_geo = PostcodeGeo.objects.filter(status="pending").count()

        self.stdout.write("\n" + self.style.SUCCESS("Current PostcodeGeo table:"))
        self.stdout.write(f"  Total: {total_geo}")
        self.stdout.write(self.style.SUCCESS(f"  ✓ Success: {successful_geo}"))
        self.stdout.write(self.style.ERROR(f"  ✗ Failed: {failed_geo}"))
        if pending_geo:
            self.stdout.write(self.style.WARNING(f"  ? Pending: {pending_geo}"))
