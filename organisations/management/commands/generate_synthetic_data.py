"""
Management command to generate synthetic data for development and testing.

Generates Plymouth-focused data that complements the real scraped event data,
including realistic events at known venues, user journey interactions, and
postcode-area analytics for the Plymouth region.

NOTE: This command is intended for development and testing only.
Do NOT run it in a production environment.

Usage:
    python manage.py generate_synthetic_data
    python manage.py generate_synthetic_data --events 100 --interactions 500
    python manage.py generate_synthetic_data --clear
"""

import hashlib
import random
from datetime import date, timedelta

try:
    from django.contrib.gis.geos import Point as _Point
except Exception:
    _Point = None
from django.core.management.base import BaseCommand
from django.utils import timezone

from analytics.models import PostcodeAreaInteraction, UserHashInteraction
from events.models import Category, Event
from organisations.models import Location, Organisation

# ---------------------------------------------------------------------------
#  Plymouth-specific data pools
# ---------------------------------------------------------------------------

# Organisations that should exist (setup_plymouth_culture creates them).
# If missing, we'll create them with these details.
PLYMOUTH_VENUES = [
    {
        "org_name": "Theatre Royal Plymouth",
        "website": "https://theatreroyal.com",
        "description": "The largest and best-attended regional producing theatre in the UK.",
        "locations": [
            {
                "name": "Theatre Royal Plymouth",
                "address": "Royal Parade, Plymouth",
                "postcode": "PL1 2TR",
                "lat": 50.3712,
                "lng": -4.1416,
            },
            {
                "name": "The Lyric",
                "address": "Royal Parade, Plymouth",
                "postcode": "PL1 2TR",
                "lat": 50.3714,
                "lng": -4.1413,
            },
            {
                "name": "The Drum",
                "address": "Royal Parade, Plymouth",
                "postcode": "PL1 2TR",
                "lat": 50.3710,
                "lng": -4.1419,
            },
        ],
    },
    {
        "org_name": "The Box Plymouth",
        "website": "https://www.theboxplymouth.com",
        "description": "One of the UK's largest museum and gallery spaces, telling the story of Plymouth.",
        "locations": [
            {
                "name": "The Box",
                "address": "Tavistock Place, Plymouth",
                "postcode": "PL4 8AX",
                "lat": 50.3749,
                "lng": -4.1353,
            },
        ],
    },
    {
        "org_name": "Plymouth Pavilions",
        "website": "https://www.plymouthpavilions.com",
        "description": "Plymouth's premier entertainment venue for live music, comedy, and arena events.",
        "locations": [
            {
                "name": "Plymouth Pavilions",
                "address": "Millbay Road, Plymouth",
                "postcode": "PL1 3LF",
                "lat": 50.3674,
                "lng": -4.1534,
            },
        ],
    },
    {
        "org_name": "Barbican Theatre",
        "website": "https://barbicantheatre.co.uk",
        "description": "Independent theatre in the heart of Plymouth's historic Barbican quarter.",
        "locations": [
            {
                "name": "Barbican Theatre",
                "address": "Castle Street, Plymouth",
                "postcode": "PL1 2NJ",
                "lat": 50.3663,
                "lng": -4.1328,
            },
        ],
    },
    {
        "org_name": "Plymouth Arts Cinema",
        "website": "https://plymouthartscinema.org",
        "description": "Independent cinema showing arthouse, world, and classic films.",
        "locations": [
            {
                "name": "Plymouth Arts Cinema",
                "address": "38 Looe Street, Plymouth",
                "postcode": "PL4 0EB",
                "lat": 50.3716,
                "lng": -4.1362,
            },
        ],
    },
    {
        "org_name": "Ocean Studios",
        "website": "https://www.oceanstudios.org.uk",
        "description": "Artist studios and creative workspace at Royal William Yard.",
        "locations": [
            {
                "name": "Ocean Studios",
                "address": "Royal William Yard, Plymouth",
                "postcode": "PL1 3RP",
                "lat": 50.3651,
                "lng": -4.1655,
            },
        ],
    },
    {
        "org_name": "Plymouth Music Zone",
        "website": "https://plymouthmusiczone.org.uk",
        "description": "Community music charity bringing music to people across Plymouth.",
        "locations": [
            {
                "name": "Plymouth Music Zone",
                "address": "Millbridge, Plymouth",
                "postcode": "PL1 3LQ",
                "lat": 50.3686,
                "lng": -4.1528,
            },
        ],
    },
    {
        "org_name": "Devonport Guildhall",
        "website": "https://www.devonportguildhall.org",
        "description": "Grade I listed building hosting arts, culture, and community events in Devonport.",
        "locations": [
            {
                "name": "Devonport Guildhall",
                "address": "Ker Street, Plymouth",
                "postcode": "PL1 4EL",
                "lat": 50.3691,
                "lng": -4.1718,
            },
        ],
    },
    {
        "org_name": "Real Ideas",
        "website": "https://realideas.org",
        "description": "Social enterprise supporting creative and community projects in Plymouth.",
        "locations": [
            {
                "name": "Market Hall",
                "address": "Devonport Market, Plymouth",
                "postcode": "PL1 4AU",
                "lat": 50.3688,
                "lng": -4.1700,
            },
        ],
    },
    {
        "org_name": "Plymouth City Council",
        "website": "https://www.plymouth.gov.uk",
        "description": "Local authority delivering public events, festivals, and civic celebrations.",
        "locations": [
            {
                "name": "Plymouth Hoe",
                "address": "Hoe Road, Plymouth",
                "postcode": "PL1 2PA",
                "lat": 50.3642,
                "lng": -4.1426,
            },
            {
                "name": "Central Park",
                "address": "Central Park Avenue, Plymouth",
                "postcode": "PL2 3DQ",
                "lat": 50.3885,
                "lng": -4.1429,
            },
            {
                "name": "The Piazza",
                "address": "Armada Way, Plymouth",
                "postcode": "PL1 1LE",
                "lat": 50.3717,
                "lng": -4.1424,
            },
        ],
    },
]

# Realistic Plymouth event titles per category
EVENT_TEMPLATES = {
    "Music": [
        "Live Jazz at the Waterfront",
        "Acoustic Night",
        "Plymouth Philharmonic Orchestra",
        "Folk Sessions",
        "Open Mic Night",
        "World Music Workshop",
        "Shanty Sing-Along",
        "Blues & Roots Night",
        "Choir Concert",
        "Samba Drumming Workshop",
    ],
    "Theatre": [
        "Shakespeare in the Park",
        "New Writing Festival",
        "One-Act Play Night",
        "Improv Comedy Show",
        "Community Theatre Showcase",
        "Monologue Slam",
        "Youth Theatre Performance",
        "Touring Production",
        "Fringe Preview",
        "Drama Workshop",
    ],
    "Dance": [
        "Contemporary Dance Night",
        "Swing Dance Social",
        "Street Dance Workshop",
        "Ballet Performance",
        "Salsa & Latin Night",
        "Ceilidh Night",
        "Tap Dance Masterclass",
        "Dance Film Screening",
    ],
    "Visual Arts": [
        "Open Studio Weekend",
        "Print-Making Workshop",
        "Life Drawing Class",
        "Watercolour for Beginners",
        "Photography Walk",
        "Digital Art Workshop",
        "Ceramics Class",
        "Mixed Media Collage",
    ],
    "Film": [
        "Documentary Screening",
        "Arthouse Double Bill",
        "Short Film Festival",
        "Director's Q&A",
        "Classic Cinema Night",
        "Animation Showcase",
        "Local Film Premiere",
        "Film & Food Night",
    ],
    "Comedy": [
        "Stand-Up Comedy Night",
        "Comedy Preview Show",
        "Sketch Comedy Evening",
        "Comedy Open Mic",
        "Headline Comedy Act",
        "Late Night Laughs",
    ],
    "Family": [
        "Children's Storytelling",
        "Family Art Workshop",
        "Puppet Show",
        "Kids' Science Fun Day",
        "Family Treasure Hunt",
        "Little Explorers Club",
        "Toddler Play Session",
        "Family Craft Morning",
    ],
    "Workshop": [
        "Creative Writing Workshop",
        "Pottery Throwing Class",
        "Screen-Printing Workshop",
        "Spoken Word Workshop",
        "Jewellery Making",
        "Book Binding Class",
        "Ukulele for Beginners",
        "Zine-Making Workshop",
    ],
    "Exhibition": [
        "Maritime Heritage Exhibition",
        "Plymouth at War Display",
        "Local Artists Exhibition",
        "Contemporary Photography Show",
        "Sculpture Garden Opening",
        "Archive Collections Display",
        "Student Degree Show",
        "Mayflower Legacy Exhibition",
    ],
    "Festival": [
        "Plymouth Fringe Festival",
        "Seafood & Shanty Festival",
        "Illuminate Light Festival",
        "Plymouth Art Weekender",
        "Ocean City Sounds",
        "Respect Festival",
        "Plymouth Pride",
    ],
    "Literature": [
        "Poetry Open Mic",
        "Author Talk & Book Signing",
        "Reading Group Special",
        "Literary Festival Event",
        "Storytelling Night",
        "Children's Book Event",
    ],
    "Heritage": [
        "Mayflower 400 Talk",
        "Plymouth History Walk",
        "Smeaton's Tower Open Day",
        "Naval Heritage Tour",
        "Drake's Plymouth Tour",
        "Royal William Yard Heritage Walk",
        "Devonport Dockyard Talk",
    ],
    "Community": [
        "Community Garden Open Day",
        "Neighbourhood Social",
        "Community Choir Rehearsal",
        "Repair Café",
        "Conversation Club",
        "Community Cook-Up",
        "Welcome Event for Newcomers",
    ],
}

# Plymouth-area postcodes for analytics data — weighted toward city centre
PLYMOUTH_POSTCODES = [
    # City centre / Barbican / Hoe
    ("PL1 1", "City Centre", 15),
    ("PL1 2", "Barbican & Hoe", 12),
    ("PL1 3", "Millbay & Stonehouse", 8),
    ("PL1 4", "Devonport", 7),
    ("PL1 5", "Stoke & Pennycomequick", 6),
    # Inner suburbs
    ("PL2 1", "North Prospect", 5),
    ("PL2 2", "Ford & Keyham", 4),
    ("PL2 3", "Peverell", 6),
    ("PL3 4", "Crownhill", 4),
    ("PL3 5", "Mannamead", 5),
    ("PL3 6", "Mutley", 7),
    ("PL4 0", "Greenbank & Lipson", 6),
    ("PL4 6", "Lipson Vale", 4),
    ("PL4 7", "Laira", 3),
    ("PL4 8", "North Hill", 5),
    ("PL4 9", "Freedom Fields", 4),
    # Outer suburbs
    ("PL5 1", "Whitleigh", 3),
    ("PL5 2", "Southway", 3),
    ("PL5 3", "Tamerton Foliot", 2),
    ("PL5 4", "Derriford", 4),
    ("PL6 5", "Roborough", 3),
    ("PL6 6", "Woolwell", 2),
    ("PL6 7", "Leigham & Mainstone", 3),
    ("PL6 8", "Plympton", 5),
    ("PL7 1", "Plympton St Maurice", 3),
    ("PL7 4", "Plymstock", 4),
    ("PL9 7", "Elburton", 3),
    ("PL9 8", "Plymstock Broadway", 3),
    ("PL9 9", "Turnchapel", 2),
    # Wider Devon / Cornwall visitors
    ("PL10", "Torpoint", 2),
    ("PL11", "Saltash", 3),
    ("PL12", "Saltash West", 2),
    ("PL19", "Tavistock", 2),
    ("PL20", "Yelverton", 1),
    ("PL21", "Ivybridge", 3),
    ("TQ7", "Kingsbridge", 1),
    ("EX8", "Exeter", 2),
]


def random_date_in_range(start, end):
    delta = end - start
    return start + timedelta(days=random.randint(0, delta.days))


class Command(BaseCommand):
    help = "Generate Plymouth-focused synthetic data for development and testing."

    def add_arguments(self, parser):
        parser.add_argument("--events", type=int, default=80, help="Number of events to create")
        parser.add_argument("--interactions", type=int, default=500, help="Number of user-hash interactions")
        parser.add_argument("--postcodes", type=int, default=100, help="Number of postcode interaction records")
        parser.add_argument(
            "--clear",
            action="store_true",
            help="Delete all existing synthetic data before generating (preserves scraped data)",
        )

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing analytics data…")
            PostcodeAreaInteraction.objects.all().delete()
            UserHashInteraction.objects.all().delete()
            # Only delete events without an external_id (synthetic ones)
            synth_count = Event.objects.filter(external_id="").count()
            Event.objects.filter(external_id="").delete()
            self.stdout.write(self.style.SUCCESS(f"Cleared {synth_count} synthetic events and all analytics data."))

        # Ensure venues exist
        self.stdout.write("Ensuring Plymouth venues exist…")
        orgs = self._ensure_venues()

        self.stdout.write(f"Creating {options['events']} events…")
        events = self._create_events(orgs, options["events"])

        self.stdout.write(f"Creating {options['interactions']} user journey interactions…")
        self._create_interactions(orgs, events, options["interactions"])

        self.stdout.write(f"Creating {options['postcodes']} postcode interaction records…")
        self._create_postcode_interactions(orgs, options["postcodes"])

        self.stdout.write(
            self.style.SUCCESS(
                f"\nSynthetic data created:\n"
                f"  {len(orgs)} organisations (ensured)\n"
                f"  {len(events)} new events\n"
                f"  {options['interactions']} user interactions\n"
                f"  {options['postcodes']} postcode records"
            )
        )

    def _ensure_venues(self):
        """Ensure all Plymouth venues exist with locations and coordinates."""
        orgs = []
        for venue in PLYMOUTH_VENUES:
            org, created = Organisation.objects.get_or_create(
                name=venue["org_name"],
                defaults={
                    "website": venue.get("website", ""),
                    "description": venue.get("description", ""),
                },
            )
            if created:
                self.stdout.write(f"  Created: {org.name}")
            orgs.append(org)

            for loc_data in venue.get("locations", []):
                point = None
                if _Point and loc_data.get("lat") and loc_data.get("lng"):
                    point = _Point(loc_data["lng"], loc_data["lat"], srid=4326)
                elif loc_data.get("lat") and loc_data.get("lng"):
                    point = f"{loc_data['lng']},{loc_data['lat']}"

                loc, loc_created = Location.objects.get_or_create(
                    organisation=org,
                    name=loc_data["name"],
                    defaults={
                        "address": loc_data.get("address", ""),
                        "postcode": loc_data.get("postcode", ""),
                        "point": point,
                    },
                )
                # Backfill coordinates if missing
                if not loc_created and not loc.point and point:
                    loc.point = point
                    loc.save(update_fields=["point"])
                    self.stdout.write(f"    Backfilled coordinates for: {loc.name}")

        return orgs

    def _get_calendar_range(self):
        """Derive date range from events already in the database."""
        from django.db.models import Max, Min

        agg = Event.objects.aggregate(earliest=Min("start_datetime"), latest=Max("start_datetime"))
        today = date.today()
        cal_start = agg["earliest"].date() if agg["earliest"] else today - timedelta(days=180)
        cal_end = agg["latest"].date() if agg["latest"] else today + timedelta(days=180)
        # Ensure at least a 6-month span
        if (cal_end - cal_start).days < 180:
            cal_end = cal_start + timedelta(days=180)
        return cal_start, cal_end

    def _create_events(self, orgs, count):
        """Create realistic Plymouth events across all venues."""
        today = date.today()
        cal_start, cal_end = self._get_calendar_range()
        # Spread events across the full calendar range
        past_start = cal_start
        future_end = cal_end
        self.stdout.write(f"  Event date range: {past_start} → {future_end}")

        # Load or create categories
        categories = {}
        for cat_name in EVENT_TEMPLATES:
            cat, _ = Category.objects.get_or_create(name=cat_name)
            categories[cat_name] = cat

        events = []
        for i in range(count):
            # Pick a category, weighted toward popular ones
            cat_name = random.choices(
                list(EVENT_TEMPLATES.keys()),
                weights=[15, 12, 5, 8, 6, 10, 12, 8, 6, 4, 4, 5, 5],
                k=1,
            )[0]
            titles = EVENT_TEMPLATES[cat_name]
            title = random.choice(titles)

            # Pick a venue — weight toward the larger venues
            org = random.choices(
                orgs,
                weights=[20, 15, 15, 10, 8, 5, 5, 5, 7, 10],
                k=1,
            )[0]
            locations = list(org.locations.all())
            location = random.choice(locations) if locations else None

            # Spread across entire calendar range, weighted toward future
            if past_start < today and random.random() < 0.3:
                event_date = random_date_in_range(past_start, today - timedelta(days=1))
            else:
                fut_start = max(today, past_start)
                event_date = random_date_in_range(fut_start, future_end)

            # Time based on event type
            if cat_name in ("Family", "Workshop", "Heritage", "Exhibition"):
                hour = random.choice([10, 11, 13, 14])
            elif cat_name in ("Comedy", "Music", "Dance"):
                hour = random.choice([19, 20, 21])
            else:
                hour = random.choice([14, 17, 19, 20])

            minute = random.choice([0, 0, 0, 30])
            start_dt = timezone.make_aware(
                timezone.datetime(event_date.year, event_date.month, event_date.day, hour, minute)
            )
            duration = random.choice([1, 1.5, 2, 2.5, 3])
            end_dt = start_dt + timedelta(hours=duration)

            # Build description
            venue_name = location.name if location else org.name
            descriptions = [
                f"Join us for {title.lower()} at {venue_name}. A wonderful evening of arts and culture in Plymouth.",
                f"{title} — an exciting event at {venue_name}. All ages welcome.",
                f"Don't miss {title.lower()} hosted by {org.name} at {venue_name}.",
                f"{org.name} presents {title.lower()}. Doors open {hour - 1 if hour > 10 else hour}:00.",
                f"Experience {title.lower()} in the heart of Plymouth at {venue_name}.",
            ]

            event = Event.objects.create(
                organisation=org,
                title=title,
                description=random.choice(descriptions),
                start_datetime=start_dt,
                end_datetime=end_dt,
                location=location,
                url=f"{org.website}/events/synth-{i + 1}" if org.website else "",
                source_tags=[cat_name.lower()],
            )
            # Assign primary category + sometimes a secondary one
            event.categories.add(categories[cat_name])
            if random.random() < 0.3:
                secondary = random.choice(list(categories.values()))
                event.categories.add(secondary)

            events.append(event)

        return events

    def _create_interactions(self, orgs, events, count):
        """Create realistic user-hash interactions spanning the events calendar."""
        today = date.today()
        cal_start, cal_end = self._get_calendar_range()
        start = cal_start
        end = min(cal_end, today)  # interactions can't be in the future
        span_days = max((end - start).days, 1)
        self.stdout.write(f"  Interaction date range: {start} → {end} ({span_days} days)")

        # Create user pool — simulate ~200 unique visitors with varying activity
        num_users = max(50, count // 5)
        fake_users = [hashlib.sha256(f"plymouth_user_{i}".encode()).hexdigest() for i in range(num_users)]
        # Some users are frequent, most are occasional
        user_weights = [random.paretovariate(1.5) for _ in fake_users]

        interactions = []
        for _ in range(count):
            user = random.choices(fake_users, weights=user_weights, k=1)[0]
            org = random.choices(
                orgs,
                weights=[20, 15, 15, 10, 8, 5, 5, 5, 7, 10],
                k=1,
            )[0]

            # 60% event interactions, 40% location interactions
            interaction_type = "event" if random.random() < 0.6 else "location"

            locations = list(org.locations.all())
            org_events = list(org.events.all())

            event = random.choice(org_events) if org_events and interaction_type == "event" else None
            location = random.choice(locations) if locations and interaction_type == "location" else None

            # Weight dates toward recent months but span the full calendar
            days_ago = int(random.paretovariate(1.2) * 10) % span_days
            interaction_date = end - timedelta(days=days_ago)
            if interaction_date < start:
                interaction_date = random_date_in_range(start, end)

            interactions.append(
                UserHashInteraction(
                    user_hash=user,
                    interaction_type=interaction_type,
                    event=event,
                    location=location,
                    organisation=org,
                    interaction_date=interaction_date,
                )
            )

        # Bulk create for performance
        UserHashInteraction.objects.bulk_create(interactions, batch_size=500)

    def _create_postcode_interactions(self, orgs, count):
        """Create postcode area interaction records spanning the events calendar."""
        today = date.today()
        cal_start, cal_end = self._get_calendar_range()
        range_end = min(cal_end, today)
        range_start = cal_start
        self.stdout.write(f"  Postcode date range: {range_start} → {range_end}")
        postcodes_with_weights = [(p[0], p[1], p[2]) for p in PLYMOUTH_POSTCODES]
        codes = [p[0] for p in postcodes_with_weights]
        areas = [p[1] for p in postcodes_with_weights]
        weights = [p[2] for p in postcodes_with_weights]

        records = []
        for _ in range(count):
            org = random.choices(
                orgs,
                weights=[20, 15, 15, 10, 8, 5, 5, 5, 7, 10],
                k=1,
            )[0]
            idx = random.choices(range(len(codes)), weights=weights, k=1)[0]

            # Random period within the events calendar range
            period_end = random_date_in_range(range_start + timedelta(days=7), range_end)
            period_length = random.choice([7, 14, 28, 30])
            period_start = max(range_start, period_end - timedelta(days=period_length))

            # Interaction count weighted by postcode popularity
            base_count = weights[idx] * random.randint(1, 10)
            interaction_count = max(1, int(base_count * random.uniform(0.3, 2.0)))

            records.append(
                PostcodeAreaInteraction(
                    organisation=org,
                    postcode=codes[idx],
                    area=areas[idx],
                    interaction_count=interaction_count,
                    period_start=period_start,
                    period_end=period_end,
                )
            )

        PostcodeAreaInteraction.objects.bulk_create(records, batch_size=500)
