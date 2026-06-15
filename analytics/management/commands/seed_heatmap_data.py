"""
Management command to seed enhanced test data with varied interaction counts
for better heatmap visualization and clustering demonstration.
"""

import random
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from analytics.models import PostcodeAreaInteraction
from organisations.models import Organisation

# Enhanced mapping of sectors to full postcodes with better geographic coverage
SECTOR_POSTCODE_MAP = {
    # Central Plymouth — HIGH DENSITY (multiple high-count clusters)
    "PL1 1": ["PL1 1AA", "PL1 1AB", "PL1 1AC", "PL1 1AD", "PL1 1AE"],
    "PL1 2": ["PL1 2AA", "PL1 2AB", "PL1 2AC", "PL1 2AD"],
    "PL1 3": ["PL1 3AA", "PL1 3AB", "PL1 3AC", "PL1 3AD", "PL1 3AE"],
    "PL1 4": ["PL1 4AP", "PL1 4AQ", "PL1 4AR", "PL1 4AS"],
    "PL1 5": ["PL1 5AR", "PL1 5AS", "PL1 5AT", "PL1 5AU"],
    # North Plymouth
    "PL2 1": ["PL2 1AA", "PL2 1AB", "PL2 1AC", "PL2 1AD", "PL2 1AE"],
    "PL2 2": ["PL2 2AB", "PL2 2AC", "PL2 2AD", "PL2 2AE"],
    "PL2 3": ["PL2 3AB", "PL2 3AC", "PL2 3AD", "PL2 3AE"],
    # North Central
    "PL3 4": ["PL3 4AA", "PL3 4AB", "PL3 4AC", "PL3 4AD"],
    "PL3 5": ["PL3 5AB", "PL3 5AC", "PL3 5AD", "PL3 5AE"],
    "PL3 6": ["PL3 6AB", "PL3 6AC", "PL3 6AD", "PL3 6AE"],
    # East Central (MEDIUM DENSITY)
    "PL4 0": ["PL4 0AA", "PL4 0AB", "PL4 0AC", "PL4 0AD"],
    "PL4 6": ["PL4 6AB", "PL4 6AC", "PL4 6AD", "PL4 6AE"],
    "PL4 7": ["PL4 7AB", "PL4 7AC", "PL4 7AD", "PL4 7AE"],
    "PL4 8": ["PL4 8AB", "PL4 8AC", "PL4 8AD", "PL4 8AE"],
    "PL4 9": ["PL4 9AB", "PL4 9AC", "PL4 9AD"],
    # West
    "PL5 1": ["PL5 1AA", "PL5 1AB", "PL5 1AC", "PL5 1AD"],
    "PL5 2": ["PL5 2AA", "PL5 2AB", "PL5 2AC", "PL5 2AD"],
    "PL5 3": ["PL5 3AA", "PL5 3AB", "PL5 3AC"],
    "PL5 4": ["PL5 4AA", "PL5 4AB", "PL5 4AC", "PL5 4AD"],
    # Southwest
    "PL6 5": ["PL6 5AB", "PL6 5AC", "PL6 5AD"],
    "PL6 6": ["PL6 6AB", "PL6 6AC", "PL6 6AD"],
    "PL6 7": ["PL6 7AB", "PL6 7AC", "PL6 7AD", "PL6 7AE"],
    "PL6 8": ["PL6 8AB", "PL6 8AC", "PL6 8AD", "PL6 8AE"],
    "PL7 1": ["PL7 1AA", "PL7 1AB", "PL7 1AC", "PL7 1AD"],
    "PL7 4": ["PL7 4AA", "PL7 4AB", "PL7 4AC", "PL7 4AD"],
    # South Coastal
    "PL9 7": ["PL9 7AB", "PL9 7AC", "PL9 7AD"],
    "PL9 8": ["PL9 8AB", "PL9 8AC"],
    "PL9 9": ["PL9 9AB", "PL9 9AC"],
    # Outer/Regional — LOW TO MEDIUM DENSITY (spread clusters)
    "PL8": ["PL8 1AA", "PL8 1AB", "PL8 1AC"],
    "PL10": ["PL10 1AA", "PL10 1AB", "PL10 1AC"],
    "PL11": ["PL11 2AA", "PL11 2AB", "PL11 2AC"],
    "PL12": ["PL12 1AA", "PL12 1AB", "PL12 1AC"],
    "PL13": ["PL13 1AA", "PL13 1AB", "PL13 1AC"],
    "PL14": ["PL14 1AA", "PL14 1AB", "PL14 1AC"],
    "PL15": ["PL15 0AB", "PL15 0AC", "PL15 0AD"],
    "PL17": ["PL17 8AB", "PL17 8AC"],
    "PL18": ["PL18 9AB", "PL18 9AC"],
    "PL19": ["PL19 8AB", "PL19 8AC"],
    "PL20": ["PL20 9AB", "PL20 9AC"],
    "PL21": ["PL21 0AA", "PL21 0AB"],
    # Non-PL areas
    "TQ3": ["TQ3 1QD", "TQ3 1QE"],
    "TQ7": ["TQ7 3AB", "TQ7 3AC"],
    "EX8": ["EX8 3AB", "EX8 3AC"],
}


def get_interaction_for_area(area_key):
    """
    Return varied interaction counts based on geographic area.
    Central areas get higher counts, outer areas get lower.
    """
    # Define density profiles for different areas
    high_density = range(150, 300)  # Central Plymouth
    medium_density = range(80, 180)  # Inner suburbs
    low_density = range(20, 100)  # Outer areas

    if area_key.startswith("PL1"):
        return random.choice(high_density)
    elif area_key.startswith("PL2") or area_key.startswith("PL3"):
        return random.choice(medium_density)
    elif area_key.startswith("PL4"):
        return random.choice(high_density)
    elif area_key.startswith("PL5") or area_key.startswith("PL6") or area_key.startswith("PL7"):
        return random.choice(medium_density)
    elif area_key.startswith("PL9"):
        return random.choice(low_density)
    else:
        return random.choice(low_density)


class Command(BaseCommand):
    help = "Seed enhanced test data with varied interaction counts for heatmap visualization"

    def add_arguments(self, parser):
        parser.add_argument(
            "--samples-per-postcode",
            type=int,
            default=3,
            help="Number of test records to create per postcode (default: 3)",
        )
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Clear existing PostcodeAreaInteraction records before seeding",
        )

    def handle(self, *args, **options):
        samples = options.get("samples_per_postcode", 3)
        clear = options.get("clear", False)

        # Get or create test organization
        org, created = Organisation.objects.get_or_create(
            name="Test Organisation", defaults={"description": "Test data for heatmap visualization"}
        )
        if created:
            self.stdout.write(self.style.SUCCESS(f"Created organization: {org.name}"))
        else:
            self.stdout.write(f"Using existing organization: {org.name}")

        # Clear existing if requested
        if clear:
            count = PostcodeAreaInteraction.objects.filter(organisation=org).count()
            PostcodeAreaInteraction.objects.filter(organisation=org).delete()
            self.stdout.write(self.style.WARNING(f"Cleared {count} existing records"))

        # Track creation
        created_count = 0
        today = timezone.now().date()
        period_start = today - timedelta(days=30)

        # Create records for each sector/postcode combination
        for sector, full_postcodes in SECTOR_POSTCODE_MAP.items():
            for full_postcode in full_postcodes:
                # Create multiple records per postcode with varied interaction counts
                for i in range(samples):
                    interaction_count = get_interaction_for_area(sector)

                    record, created = PostcodeAreaInteraction.objects.get_or_create(
                        organisation=org,
                        postcode=full_postcode,
                        period_start=period_start,
                        period_end=today,
                        defaults={
                            "area": sector,
                            "interaction_count": interaction_count,
                        },
                    )

                    if created:
                        created_count += 1
                        # Occasionally update to simulate different counts
                        if i > 0:
                            record.interaction_count = interaction_count
                            record.save()

        self.stdout.write(self.style.SUCCESS("\n" + "=" * 60))
        self.stdout.write(self.style.SUCCESS(f"Created {created_count} new postcode records"))
        self.stdout.write(self.style.SUCCESS(f"Total {sector} sectors mapped"))
        self.stdout.write(self.style.SUCCESS(f"Organization: {org.name} ({org.id})"))

        # Show sample
        samples_list = PostcodeAreaInteraction.objects.filter(organisation=org).order_by("-interaction_count")[:5]
        self.stdout.write("\nTop 5 by interaction count:")
        for rec in samples_list:
            self.stdout.write(f"  {rec.postcode:10s} → {rec.interaction_count:3d} interactions ({rec.area})")
