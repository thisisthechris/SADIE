"""
Management command to seed the Plymouth Culture ScrapeSource
and optionally pre-populate known organisations, locations, and categories.
"""
from django.core.management.base import BaseCommand

from events.models import Category
from organisations.models import Location, Organisation
from scraping.models import ScrapeSource

# Known Plymouth Culture member venues and their approximate postcodes
KNOWN_VENUES = [
    {
        "org_name": "Theatre Royal Plymouth",
        "locations": [
            {"name": "Theatre Royal Plymouth", "address": "Royal Parade, Plymouth", "postcode": "PL1 2TR"},
            {"name": "The Lyric", "address": "Royal Parade, Plymouth", "postcode": "PL1 2TR"},
            {"name": "The Drum", "address": "Royal Parade, Plymouth", "postcode": "PL1 2TR"},
        ],
    },
    {
        "org_name": "The Box Plymouth",
        "locations": [
            {"name": "The Box", "address": "Tavistock Place, Plymouth", "postcode": "PL4 8AX"},
        ],
    },
    {
        "org_name": "Plymouth Pavilions",
        "locations": [
            {"name": "Plymouth Pavilions", "address": "Millbay Road, Plymouth", "postcode": "PL1 3LF"},
        ],
    },
    {
        "org_name": "Barbican Theatre",
        "locations": [
            {"name": "Barbican Theatre", "address": "Castle Street, Plymouth", "postcode": "PL1 2NJ"},
        ],
    },
    {
        "org_name": "Plymouth Arts Cinema",
        "locations": [
            {"name": "Plymouth Arts Cinema", "address": "38 Looe Street, Plymouth", "postcode": "PL4 0EB"},
        ],
    },
    {
        "org_name": "Ocean Studios",
        "locations": [
            {"name": "Ocean Studios", "address": "Royal William Yard, Plymouth", "postcode": "PL1 3RP"},
        ],
    },
    {
        "org_name": "Plymouth Music Zone",
        "locations": [
            {"name": "Plymouth Music Zone", "address": "", "postcode": ""},
        ],
    },
    {
        "org_name": "Devonport Guildhall",
        "locations": [
            {"name": "Devonport Guildhall", "address": "Ker Street, Plymouth", "postcode": "PL1 4EL"},
        ],
    },
    {
        "org_name": "Plymouth City Council",
        "locations": [],
    },
]

# Categories commonly seen on Plymouth Culture
KNOWN_CATEGORIES = [
    "Music",
    "Theatre",
    "Dance",
    "Visual Arts",
    "Film",
    "Comedy",
    "Family",
    "Workshop",
    "Exhibition",
    "Festival",
    "Literature",
    "Heritage",
    "Outdoor",
    "Community",
    # TRP genres
    "Drama",
    "Musicals",
    "Opera",
    "Pantomime",
    "General Entertainment",
    "Gig/Concert",
    "Amateur",
    # The Box categories
    "Displays",
    "Talks and Tours",
    "Super Saturdays",
]


class Command(BaseCommand):
    help = "Seed Plymouth Culture scrape source, known venues, and categories"

    def add_arguments(self, parser):
        parser.add_argument(
            "--venues-only",
            action="store_true",
            help="Only create venues and categories, skip scrape source setup",
        )

    def handle(self, *args, **options):
        venues_only = options["venues_only"]

        if not venues_only:
            # Plymouth Culture (Squarespace JSON API)
            source, created = ScrapeSource.objects.update_or_create(
                name="Plymouth Culture",
                defaults={
                    "base_url": "https://www.plymouthculture.co.uk",
                    "api_path": "/events-1",
                    "scraper_task_name": "scraping.tasks.scrape_plymouth_culture",
                    "enabled": True,
                    "scrape_interval_hours": 24,
                },
            )
            verb = "Created" if created else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{verb} ScrapeSource: {source.name}"))

            # Theatre Royal Plymouth (HTML scraper)
            source2, created2 = ScrapeSource.objects.update_or_create(
                name="Theatre Royal Plymouth",
                defaults={
                    "base_url": "https://theatreroyal.com",
                    "api_path": "/whats-on/",
                    "scraper_task_name": "scraping.tasks.scrape_theatre_royal",
                    "enabled": True,
                    "scrape_interval_hours": 24,
                },
            )
            verb2 = "Created" if created2 else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{verb2} ScrapeSource: {source2.name}"))

            # The Box Plymouth (embedded JSON scraper)
            source3, created3 = ScrapeSource.objects.update_or_create(
                name="The Box Plymouth",
                defaults={
                    "base_url": "https://www.theboxplymouth.com",
                    "api_path": "/events",
                    "scraper_task_name": "scraping.tasks.scrape_the_box",
                    "enabled": True,
                    "scrape_interval_hours": 24,
                },
            )
            verb3 = "Created" if created3 else "Updated"
            self.stdout.write(self.style.SUCCESS(f"{verb3} ScrapeSource: {source3.name}"))

        # Seed organisations and locations
        for venue_data in KNOWN_VENUES:
            org, created = Organisation.objects.get_or_create(
                name=venue_data["org_name"],
            )
            verb = "Created" if created else "Exists"
            self.stdout.write(f"  {verb}: Organisation '{org.name}'")

            for loc_data in venue_data["locations"]:
                loc, created = Location.objects.get_or_create(
                    organisation=org,
                    name=loc_data["name"],
                    defaults={
                        "address": loc_data.get("address", ""),
                        "postcode": loc_data.get("postcode", ""),
                    },
                )
                verb = "Created" if created else "Exists"
                self.stdout.write(f"    {verb}: Location '{loc.name}'")

        # Seed categories
        for cat_name in KNOWN_CATEGORIES:
            cat, created = Category.objects.get_or_create(name=cat_name)
            verb = "Created" if created else "Exists"
            self.stdout.write(f"  {verb}: Category '{cat.name}'")

        self.stdout.write(self.style.SUCCESS("Plymouth Culture setup complete!"))
