"""
Management command to generate synthetic data for development and testing.

Usage:
    python manage.py generate_synthetic_data
    python manage.py generate_synthetic_data --orgs 5 --events 50 --interactions 200
    python manage.py generate_synthetic_data --clear
"""
import hashlib
import random
from datetime import date, timedelta

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.utils import timezone

from organisations.models import Organisation, Location
from events.models import Event
from analytics.models import UserHashInteraction, PostcodeAreaInteraction

# Sample data pools
ORG_NAMES = [
    "Northern Stage", "Sage Gateshead", "Baltic Centre for Contemporary Art",
    "Tate Modern", "Royal Exchange Theatre", "HOME Manchester",
    "Barbican Centre", "Southbank Centre", "Bristol Old Vic",
    "Leeds Playhouse", "Curve Theatre", "Theatre Royal Plymouth",
    "Tramway Glasgow", "Edinburgh Fringe Society", "Welsh National Opera",
    "Birmingham Repertory Theatre", "Nottingham Playhouse",
    "Sheffield Theatres", "Crucible Theatre", "York Theatre Royal",
]

ORG_DESCRIPTIONS = [
    "A world-class arts venue bringing communities together.",
    "Contemporary arts and culture at the heart of the city.",
    "Celebrating creativity and innovation in the performing arts.",
    "A vibrant hub for theatre, music, and visual arts.",
    "Dedicated to making arts accessible to everyone.",
]

LOCATION_NAMES = [
    "Main Theatre", "Studio Space", "Gallery One", "Concert Hall",
    "Black Box Theatre", "Rehearsal Room", "Outdoor Amphitheatre",
    "Cinema Screen", "Exhibition Space", "Workshop Room",
]

EVENT_PREFIXES = [
    "An Evening of", "A Night of", "A Celebration of",
    "A Festival of", "A Season of", "An Exploration of",
]

EVENT_THEMES = [
    "Contemporary Dance", "Live Music", "Stand-Up Comedy",
    "Classical Theatre", "Visual Arts", "Poetry & Spoken Word",
    "Jazz & Blues", "Folk & Roots", "Opera", "Ballet",
    "Experimental Performance", "Community Drama", "Children's Theatre",
    "Documentary Film", "World Music",
]

UK_POSTCODES = [
    ("EC1A", "Islington"), ("W1A", "Westminster"), ("SW1A", "Westminster"),
    ("E1", "Tower Hamlets"), ("SE1", "Southwark"), ("N1", "Islington"),
    ("NW1", "Camden"), ("WC1", "Camden"), ("WC2", "Westminster"),
    ("M1", "Manchester"), ("M2", "Manchester"), ("LS1", "Leeds"),
    ("B1", "Birmingham"), ("B2", "Birmingham"), ("G1", "Glasgow"),
    ("EH1", "Edinburgh"), ("CF10", "Cardiff"), ("BS1", "Bristol"),
    ("NE1", "Newcastle"), ("S1", "Sheffield"),
]

# Approximate UK city coordinates for plausible Points
UK_COORDS = [
    (51.5074, -0.1278),   # London
    (53.4808, -2.2426),   # Manchester
    (53.8008, -1.5491),   # Leeds
    (52.4862, -1.8904),   # Birmingham
    (55.8642, -4.2518),   # Glasgow
    (55.9533, -3.1883),   # Edinburgh
    (51.4816, -3.1791),   # Cardiff
    (51.4545, -2.5879),   # Bristol
    (54.9783, -1.6178),   # Newcastle
    (53.3811, -1.4701),   # Sheffield
]


def random_date_in_range(start, end):
    delta = end - start
    return start + timedelta(days=random.randint(0, delta.days))


class Command(BaseCommand):
    help = "Generate synthetic data for development and testing."

    def add_arguments(self, parser):
        parser.add_argument("--orgs", type=int, default=5, help="Number of organisations to create")
        parser.add_argument("--events", type=int, default=40, help="Number of events to create")
        parser.add_argument("--interactions", type=int, default=150, help="Number of user-hash interactions")
        parser.add_argument("--postcodes", type=int, default=30, help="Number of postcode interaction records")
        parser.add_argument("--clear", action="store_true", help="Delete all existing data before generating")

    def handle(self, *args, **options):
        if options["clear"]:
            self.stdout.write("Clearing existing data…")
            PostcodeAreaInteraction.objects.all().delete()
            UserHashInteraction.objects.all().delete()
            Event.objects.all().delete()
            Location.objects.all().delete()
            Organisation.objects.all().delete()
            self.stdout.write(self.style.SUCCESS("All data cleared."))

        self.stdout.write("Creating organisations and locations…")
        orgs = self._create_orgs(options["orgs"])

        self.stdout.write("Creating events…")
        events = self._create_events(orgs, options["events"])

        self.stdout.write("Creating user-hash interactions…")
        self._create_interactions(orgs, events, options["interactions"])

        self.stdout.write("Creating postcode area interactions…")
        self._create_postcode_interactions(orgs, options["postcodes"])

        self.stdout.write(self.style.SUCCESS(
            f"\nSynthetic data created: "
            f"{len(orgs)} orgs, "
            f"{Event.objects.count()} events, "
            f"{UserHashInteraction.objects.count()} interactions, "
            f"{PostcodeAreaInteraction.objects.count()} postcode records."
        ))

    def _create_orgs(self, count):
        org_pool = random.sample(ORG_NAMES, min(count, len(ORG_NAMES)))
        orgs = []
        for i, name in enumerate(org_pool):
            org, _ = Organisation.objects.get_or_create(
                name=name,
                defaults={
                    "website": f"https://{name.lower().replace(' ', '-')}.example.com",
                    "description": random.choice(ORG_DESCRIPTIONS),
                },
            )
            orgs.append(org)
            # Create 1-3 locations per organisation
            num_locs = random.randint(1, 3)
            coord = UK_COORDS[i % len(UK_COORDS)]
            for j in range(num_locs):
                lat = coord[0] + random.uniform(-0.05, 0.05)
                lng = coord[1] + random.uniform(-0.05, 0.05)
                postcode_entry = random.choice(UK_POSTCODES)
                Location.objects.get_or_create(
                    organisation=org,
                    name=random.choice(LOCATION_NAMES),
                    defaults={
                        "address": f"{random.randint(1, 200)} Example Street",
                        "postcode": postcode_entry[0],
                        "point": Point(lng, lat),
                    },
                )
        return orgs

    def _create_events(self, orgs, count):
        today = date.today()
        start = today - timedelta(days=90)
        end = today + timedelta(days=180)
        events = []
        for _ in range(count):
            org = random.choice(orgs)
            locations = list(org.locations.all())
            location = random.choice(locations) if locations else None
            event_date = random_date_in_range(start, end)
            hour = random.choice([10, 14, 17, 19, 20])
            start_dt = timezone.make_aware(
                timezone.datetime(event_date.year, event_date.month, event_date.day, hour, 0)
            )
            title = f"{random.choice(EVENT_PREFIXES)} {random.choice(EVENT_THEMES)}"
            event, _ = Event.objects.get_or_create(
                organisation=org,
                title=title,
                start_datetime=start_dt,
                defaults={
                    "description": f"Join us for {title.lower()} at {org.name}.",
                    "end_datetime": start_dt + timedelta(hours=random.choice([1, 2, 3])),
                    "location": location,
                    "url": f"{org.website}/events/{random.randint(100, 999)}",
                },
            )
            events.append(event)
        return events

    def _create_interactions(self, orgs, events, count):
        today = date.today()
        start = today - timedelta(days=180)
        # Generate a small pool of fake user hashes
        fake_users = [
            hashlib.sha256(f"user_{i}".encode()).hexdigest() for i in range(max(1, count // 5))
        ]
        for _ in range(count):
            org = random.choice(orgs)
            interaction_type = random.choice(["event", "location"])
            locations = list(org.locations.all())
            org_events = list(org.events.all())
            event = random.choice(org_events) if org_events and interaction_type == "event" else None
            location = random.choice(locations) if locations and interaction_type == "location" else None
            interaction_date = random_date_in_range(start, today)
            UserHashInteraction.objects.create(
                user_hash=random.choice(fake_users),
                interaction_type=interaction_type,
                event=event,
                location=location,
                organisation=org,
                interaction_date=interaction_date,
            )

    def _create_postcode_interactions(self, orgs, count):
        today = date.today()
        for _ in range(count):
            org = random.choice(orgs)
            postcode_entry = random.choice(UK_POSTCODES)
            period_end = random_date_in_range(today - timedelta(days=90), today)
            period_start = period_end - timedelta(days=random.choice([7, 14, 28, 30]))
            PostcodeAreaInteraction.objects.create(
                organisation=org,
                postcode=postcode_entry[0],
                area=postcode_entry[1],
                interaction_count=random.randint(1, 200),
                period_start=period_start,
                period_end=period_end,
            )
