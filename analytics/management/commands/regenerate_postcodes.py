"""Management command to regenerate PostcodeAreaInteraction test data with full postcodes."""

from django.core.management.base import BaseCommand

from analytics.models import PostcodeAreaInteraction

# Mapping of sector/outcode → list of full postcodes for geographic diversity.
# Multiple full postcodes per sector enable finer neighborhood-level clustering.
# Expanded with more postcodes for better heatmap visualization and geographic spread.
SECTOR_TO_FULL_POSTCODE = {
    # Central Plymouth (City Centre, Barbican, Hoe) — HIGH DENSITY
    "PL1 1": ["PL1 1AA", "PL1 1AB", "PL1 1AC", "PL1 1AD", "PL1 1AE"],
    "PL1 2": ["PL1 2AA", "PL1 2AB", "PL1 2AC", "PL1 2AD"],
    "PL1 3": ["PL1 3AA", "PL1 3AB", "PL1 3AC", "PL1 3AD", "PL1 3AE"],
    "PL1 4": ["PL1 4AP", "PL1 4AQ", "PL1 4AR", "PL1 4AS"],
    "PL1 5": ["PL1 5AR", "PL1 5AS", "PL1 5AT", "PL1 5AU"],
    
    # North Plymouth (North Prospect, Ford, Keyham, Peverell)
    "PL2 1": ["PL2 1AA", "PL2 1AB", "PL2 1AC", "PL2 1AD", "PL2 1AE"],
    "PL2 2": ["PL2 2AB", "PL2 2AC", "PL2 2AD", "PL2 2AE"],
    "PL2 3": ["PL2 3AB", "PL2 3AC", "PL2 3AD", "PL2 3AE"],
    
    # North Central (Crownhill, Mannamead, Mutley)
    "PL3 4": ["PL3 4AA", "PL3 4AB", "PL3 4AC", "PL3 4AD"],
    "PL3 5": ["PL3 5AB", "PL3 5AC", "PL3 5AD", "PL3 5AE"],
    "PL3 6": ["PL3 6AB", "PL3 6AC", "PL3 6AD", "PL3 6AE"],
    
    # East Central (Greenbank, Lipson, Laira, North Hill, Freedom Fields) — MEDIUM-HIGH DENSITY
    "PL4 0": ["PL4 0AA", "PL4 0AB", "PL4 0AC", "PL4 0AD"],
    "PL4 6": ["PL4 6AB", "PL4 6AC", "PL4 6AD", "PL4 6AE"],
    "PL4 7": ["PL4 7AB", "PL4 7AC", "PL4 7AD", "PL4 7AE"],
    "PL4 8": ["PL4 8AB", "PL4 8AC", "PL4 8AD", "PL4 8AE"],
    "PL4 9": ["PL4 9AB", "PL4 9AC", "PL4 9AD"],
    
    # West (Whitleigh, Southway, Tamerton, Derriford)
    "PL5 1": ["PL5 1AA", "PL5 1AB", "PL5 1AC", "PL5 1AD"],
    "PL5 2": ["PL5 2AA", "PL5 2AB", "PL5 2AC", "PL5 2AD"],
    "PL5 3": ["PL5 3AA", "PL5 3AB", "PL5 3AC"],
    "PL5 4": ["PL5 4AA", "PL5 4AB", "PL5 4AC", "PL5 4AD"],
    
    # Southwest (Roborough, Woolwell, Leigham, Plympton, Plymstock) — SPREAD AREA
    "PL6 5": ["PL6 5AB", "PL6 5AC", "PL6 5AD"],
    "PL6 6": ["PL6 6AB", "PL6 6AC", "PL6 6AD"],
    "PL6 7": ["PL6 7AB", "PL6 7AC", "PL6 7AD", "PL6 7AE"],
    "PL6 8": ["PL6 8AB", "PL6 8AC", "PL6 8AD", "PL6 8AE"],
    "PL7 1": ["PL7 1AA", "PL7 1AB", "PL7 1AC", "PL7 1AD"],
    "PL7 4": ["PL7 4AA", "PL7 4AB", "PL7 4AC", "PL7 4AD"],
    
    # South Coastal (Elburton, Plymstock, Turnchapel)
    "PL9 7": ["PL9 7AB", "PL9 7AC", "PL9 7AD"],
    "PL9 8": ["PL9 8AB", "PL9 8AC"],
    "PL9 9": ["PL9 9AB", "PL9 9AC"],
    
    # Outer Plymouth/Regional (Liskeard, Torpoint, Saltash, Looe, Bodmin)
    "PL8": ["PL8 1AA", "PL8 1AB", "PL8 1AC"],
    "PL10": ["PL10 1AA", "PL10 1AB", "PL10 1AC"],
    "PL11": ["PL11 2AA", "PL11 2AB", "PL11 2AC"],
    "PL12": ["PL12 1AA", "PL12 1AB", "PL12 1AC"],
    "PL13": ["PL13 1AA", "PL13 1AB", "PL13 1AC"],
    "PL14": ["PL14 1AA", "PL14 1AB", "PL14 1AC"],
    
    # Far West (Mevagissey, Penzance, St Austell)
    "PL15": ["PL15 0AB", "PL15 0AC", "PL15 0AD"],
    "PL17": ["PL17 8AB", "PL17 8AC"],
    "PL18": ["PL18 9AB", "PL18 9AC"],
    
    # Regional edges (Tavistock, Yelverton, Ivybridge)
    "PL19": ["PL19 8AB", "PL19 8AC"],
    "PL20": ["PL20 9AB", "PL20 9AC"],
    "PL21": ["PL21 0AA", "PL21 0AB"],
    
    # Non-PL areas (Totnes, Kingsbridge, Exeter)
    "TQ3": ["TQ3 1QD", "TQ3 1QE"],
    "TQ7": ["TQ7 3AB", "TQ7 3AC"],
    "EX8": ["EX8 3AB", "EX8 3AC"],
}


class Command(BaseCommand):
    help = "Regenerate PostcodeAreaInteraction test data with full postcodes."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without modifying database.",
        )

    def handle(self, *args, **options):
        import random
        
        dry_run = options.get("dry_run", False)
        
        # Get all existing records
        records = list(PostcodeAreaInteraction.objects.all())
        total = len(records)
        
        self.stdout.write(f"Found {total} PostcodeAreaInteraction records to process.")
        
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN MODE — no changes will be made"))
        
        # Track changes
        updated = 0
        unmapped = set()
        
        for record in records:
            old_postcode = record.postcode
            
            # Look up the full postcode mapping (handle both lists and single values)
            postcode_options = SECTOR_TO_FULL_POSTCODE.get(old_postcode)
            if not postcode_options:
                unmapped.add(old_postcode)
                self.stdout.write(
                    self.style.WARNING(f"  ⚠ No mapping for '{old_postcode}' — skipping")
                )
                continue
            
            # Pick random option if list, otherwise use single value
            new_postcode = random.choice(postcode_options) if isinstance(postcode_options, list) else postcode_options
            
            if old_postcode != new_postcode:
                updated += 1
                self.stdout.write(f"  {old_postcode} → {new_postcode}")
                
                if not dry_run:
                    record.postcode = new_postcode
                    record.save()
        
        # Summary
        self.stdout.write("\n" + self.style.SUCCESS("=" * 60))
        self.stdout.write(self.style.SUCCESS(f"Processed {total} records"))
        self.stdout.write(self.style.SUCCESS(f"  Updated: {updated}"))
        
        if unmapped:
            self.stdout.write(self.style.WARNING(f"  Unmapped: {len(unmapped)}"))
            for pc in sorted(unmapped):
                self.stdout.write(f"    - {pc}")
        
        if dry_run:
            self.stdout.write(self.style.WARNING("\nDRY RUN: No changes were made."))
            self.stdout.write("Run without --dry-run to apply changes.")
        else:
            self.stdout.write(self.style.SUCCESS("\n✓ All postcodes updated to full format!"))
            self.stdout.write("Run: python manage.py geocode_postcodes")
            self.stdout.write("     to populate PostcodeGeo cache with coordinates.")
